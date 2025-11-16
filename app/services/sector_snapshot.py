from __future__ import annotations

import asyncio
import json
import hashlib
import os
import tempfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import median
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Set, Tuple

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - Python < 3.9 fallback
    ZoneInfo = None  # type: ignore[assignment]

import duckdb  # type: ignore[import]

from app.config import load_config
from app.schemas.sector_volume import (
    SectorIn,
    SectorVolumeDTO,
    TickerLeaderDTO,
    TickerMetricDTO,
)


DATA_DIR = Path("data")
SNAPSHOT_DB = DATA_DIR / "market.duckdb"
SNAPSHOT_DIR = Path("snapshots")
LATEST_SNAPSHOT_JSON = SNAPSHOT_DIR / "sectors_volume_latest.json"
SNAPSHOT_CHECKSUM_DIR = SNAPSHOT_DIR / "checksums"

FAILURE_THRESHOLD = 3
FAILURE_WINDOW_DAYS = 30
MIN_HISTORY_DAYS = 11

try:
    EASTERN_TZ = ZoneInfo("America/New_York") if ZoneInfo else None
except Exception:  # pragma: no cover - zoneinfo may be missing tzdata
    EASTERN_TZ = None

SNAPSHOT_WRITE_LOCK = asyncio.Lock()
_SECTOR_LOCKS: Dict[str, asyncio.Lock] = {}


class SnapshotNotFoundError(Exception):
    """Raised when no sector volume snapshot is available."""


def get_sector_lock(sector_id: str) -> asyncio.Lock:
    key = sector_id.strip().upper()
    lock = _SECTOR_LOCKS.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _SECTOR_LOCKS[key] = lock
    return lock


@dataclass
class TickerMetric:
    symbol: str
    last_date: Optional[str]
    dollar_vol_today: Optional[float]
    avg_dollar_vol10: Optional[float]
    rel_vol10: Optional[float]
    change1d: Optional[float]
    change5d: Optional[float]
    dollar_vol5d: Optional[float]
    history: List[Dict[str, float]]
    adr20_pct: Optional[float] = None
    ytd_gain_to_high_pct: Optional[float] = None
    ytd_off_high_pct: Optional[float] = None
    ralph_score: Optional[float] = None


def _load_metrics_from_db() -> Tuple[Dict[str, TickerMetric], Set[str]]:
    if not SNAPSHOT_DB.exists():
        return {}, set()

    conn = duckdb.connect(str(SNAPSHOT_DB))
    try:
        rows = conn.execute(
            """
            SELECT symbol,
                   CAST(last_date AS VARCHAR) AS last_date,
                   dollar_vol_today,
                   avg_dollar_vol10,
                   rel_vol10,
                   change1d,
                   change5d,
                   adr20_pct,
                   dollar_vol5d,
                   ytd_gain_to_high_pct,
                   ytd_off_high_pct,
                   ralph_score,
                   price_history
            FROM ticker_metrics
            """
        ).fetchall()
    except duckdb.Error:
        conn.close()
        return {}, set()

    metrics: Dict[str, TickerMetric] = {}
    for (
        symbol,
        last_date,
        dollar_vol_today,
        avg_dollar_vol10,
        rel_vol10,
        change1d,
        change5d,
        adr20_pct,
        dollar_vol5d,
        ytd_gain_to_high_pct,
        ytd_off_high_pct,
        ralph_score,
        history_json,
    ) in rows:
        try:
            history_data = json.loads(history_json) if history_json else []
        except (TypeError, json.JSONDecodeError):
            history_data = []

        parsed_history: List[Dict[str, float]] = []
        for entry in history_data:
            if not isinstance(entry, dict):
                continue
            date_val = entry.get("date")
            close_val = entry.get("close")
            volume_val = entry.get("volume")
            dollar_val = entry.get("dollarVolume")
            record: Dict[str, float] = {}
            if isinstance(date_val, str):
                record["date"] = date_val
            if isinstance(close_val, (int, float)):
                record["close"] = float(close_val)
            if isinstance(volume_val, (int, float)):
                record["volume"] = float(volume_val)
            if isinstance(dollar_val, (int, float)):
                record["dollarVolume"] = float(dollar_val)
            if record:
                parsed_history.append(record)

        metrics[symbol] = TickerMetric(
            symbol=symbol,
            last_date=last_date if last_date else None,
            dollar_vol_today=_safe_float(dollar_vol_today),
            avg_dollar_vol10=_safe_float(avg_dollar_vol10),
            rel_vol10=_safe_float(rel_vol10),
            change1d=_safe_float(change1d),
            change5d=_safe_float(change5d),
            dollar_vol5d=_safe_float(dollar_vol5d),
            history=parsed_history,
            adr20_pct=_safe_float(adr20_pct),
            ytd_gain_to_high_pct=_safe_float(ytd_gain_to_high_pct),
            ytd_off_high_pct=_safe_float(ytd_off_high_pct),
            ralph_score=_safe_float(ralph_score),
        )

    try:
        failure_rows = conn.execute(
            """
            SELECT symbol, failure_count, last_failure
            FROM ticker_failures
            """
        ).fetchall()
    except duckdb.Error:
        failure_rows = []

    conn.close()
    inactive = _determine_inactive(failure_rows)
    return metrics, inactive


def _safe_float(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result


def _determine_inactive(rows: List[tuple]) -> Set[str]:
    inactive: Set[str] = set()
    if not rows:
        return inactive

    cutoff = datetime.now() - timedelta(days=FAILURE_WINDOW_DAYS)
    for symbol, failure_count, last_failure in rows:
        if not symbol or failure_count is None:
            continue
        try:
            count = int(failure_count)
        except (TypeError, ValueError):
            continue
        if count < FAILURE_THRESHOLD:
            continue
        lf_dt: Optional[datetime]
        if isinstance(last_failure, datetime):
            lf_dt = last_failure
        elif isinstance(last_failure, str):
            try:
                lf_dt = datetime.fromisoformat(last_failure)
            except Exception:
                lf_dt = None
        else:
            lf_dt = None
        if lf_dt is None or lf_dt >= cutoff:
            inactive.add(str(symbol).upper())

    return inactive


def _coerce_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return None
        return parsed.date()
    return None


def compute_ytd_ralph_metrics(
    dates: Sequence[Any], closes: Sequence[float]
) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    if not dates or not closes:
        return None, None, None

    normalized: List[Tuple[date, float]] = []
    for raw_date, close_value in zip(dates, closes):
        parsed_date = _coerce_date(raw_date)
        if parsed_date is None:
            continue
        try:
            close_float = float(close_value)
        except (TypeError, ValueError):
            continue
        normalized.append((parsed_date, close_float))

    if not normalized:
        return None, None, None

    normalized.sort(key=lambda item: item[0])
    latest_date = normalized[-1][0]
    year_start = date(latest_date.year, 1, 1)
    ytd_samples = [entry for entry in normalized if entry[0] >= year_start]
    if not ytd_samples:
        return None, None, None

    open_ytd = ytd_samples[0][1]
    close_latest = ytd_samples[-1][1]
    high_ytd = max(value for _, value in ytd_samples)
    if (
        open_ytd is None
        or close_latest is None
        or high_ytd is None
        or open_ytd <= 0
        or close_latest <= 0
        or high_ytd <= 0
    ):
        return None, None, None

    pct_gain = (high_ytd / open_ytd - 1.0) * 100.0
    pct_off = 0.0
    if high_ytd > 0:
        pct_off = max((1.0 - close_latest / high_ytd) * 100.0, 0.0)
    denom = max(pct_off, 1.0)
    ralph_score = pct_gain / denom if denom else None
    return pct_gain, pct_off, ralph_score


def _load_inactive_symbols(conn: duckdb.DuckDBPyConnection) -> Set[str]:
    try:
        rows = conn.execute(
            """
            SELECT symbol, failure_count, last_failure
            FROM ticker_failures
            """
        ).fetchall()
    except duckdb.Error:
        return set()
    return _determine_inactive(rows)


def _load_metrics_for_symbols(
    conn: duckdb.DuckDBPyConnection, symbols: Iterable[str]
) -> Dict[str, TickerMetric]:
    normalized = []
    for symbol in symbols:
        if not symbol:
            continue
        normalized_symbol = str(symbol).strip().upper()
        if normalized_symbol:
            normalized.append(normalized_symbol)
    if not normalized:
        return {}

    placeholders = ",".join("?" for _ in normalized)
    query = f"""
        SELECT symbol,
               CAST(last_date AS VARCHAR) AS last_date,
               dollar_vol_today,
               avg_dollar_vol10,
               rel_vol10,
               change1d,
               change5d,
               adr20_pct,
               dollar_vol5d,
               ytd_gain_to_high_pct,
               ytd_off_high_pct,
               ralph_score,
               price_history
        FROM ticker_metrics
        WHERE symbol IN ({placeholders})
    """
    metrics: Dict[str, TickerMetric] = {}
    try:
        rows = conn.execute(query, normalized).fetchall()
    except duckdb.Error:
        rows = []

    for (
        symbol,
        last_date,
        dollar_vol_today,
        avg_dollar_vol10,
        rel_vol10,
        change1d,
        change5d,
        adr20_pct,
        dollar_vol5d,
        ytd_gain_to_high_pct,
        ytd_off_high_pct,
        ralph_score,
        history_json,
    ) in rows:
        if not symbol:
            continue
        key = str(symbol).strip().upper()
        try:
            history_data = json.loads(history_json) if history_json else []
        except (TypeError, json.JSONDecodeError):
            history_data = []
        parsed_history: List[Dict[str, float]] = []
        for entry in history_data:
            if not isinstance(entry, dict):
                continue
            record: Dict[str, float] = {}
            date_val = entry.get("date")
            if isinstance(date_val, str):
                record["date"] = date_val
            close_val = entry.get("close")
            if isinstance(close_val, (int, float)):
                record["close"] = float(close_val)
            volume_val = entry.get("volume")
            if isinstance(volume_val, (int, float)):
                record["volume"] = float(volume_val)
            dollar_val = entry.get("dollarVolume")
            if isinstance(dollar_val, (int, float)):
                record["dollarVolume"] = float(dollar_val)
            if record:
                parsed_history.append(record)

        metrics[key] = TickerMetric(
            symbol=key,
            last_date=last_date if last_date else None,
            dollar_vol_today=_safe_float(dollar_vol_today),
            avg_dollar_vol10=_safe_float(avg_dollar_vol10),
            rel_vol10=_safe_float(rel_vol10),
            change1d=_safe_float(change1d),
            change5d=_safe_float(change5d),
            dollar_vol5d=_safe_float(dollar_vol5d),
            history=parsed_history,
            adr20_pct=_safe_float(adr20_pct),
            ytd_gain_to_high_pct=_safe_float(ytd_gain_to_high_pct),
            ytd_off_high_pct=_safe_float(ytd_off_high_pct),
            ralph_score=_safe_float(ralph_score),
        )

    return metrics


def _compute_metric_from_ohlc(
    conn: duckdb.DuckDBPyConnection, symbol: str
) -> Optional[TickerMetric]:
    try:
        rows = conn.execute(
            """
            SELECT date, close, volume, dollar_volume, high, low
            FROM ticker_ohlc
            WHERE symbol = ?
            ORDER BY date
            """,
            (symbol,),
        ).fetchall()
    except duckdb.Error:
        return None

    if len(rows) < MIN_HISTORY_DAYS:
        return None

    dates: List[str] = []
    date_objs: List[date] = []
    closes: List[float] = []
    volumes: List[float] = []
    dollar_vols: List[float] = []
    range_ratios: List[float] = []
    for date_val, close, volume, dollar_volume, high, low in rows:
        if (
            date_val is None
            or close is None
            or volume is None
            or dollar_volume is None
        ):
            continue
        if isinstance(date_val, datetime):
            parsed_date = date_val.date()
        elif isinstance(date_val, date):
            parsed_date = date_val
        else:
            try:
                parsed_date = datetime.fromisoformat(str(date_val)).date()
            except Exception:
                continue
        date_objs.append(parsed_date)
        date_str = parsed_date.isoformat()
        try:
            close_val = float(close)
            volume_val = float(volume)
            dollar_val = float(dollar_volume)
            high_val = float(high) if high is not None else None
            low_val = float(low) if low is not None else None
        except (TypeError, ValueError):
            continue
        dates.append(date_str)
        closes.append(close_val)
        volumes.append(volume_val)
        dollar_vols.append(dollar_val)
        if high_val is not None and low_val is not None and low_val != 0:
            ratio = high_val / low_val
            if ratio > 0:
                range_ratios.append(ratio)

    ytd_gain, ytd_off, ralph_score = compute_ytd_ralph_metrics(date_objs, closes)

    if len(dates) < MIN_HISTORY_DAYS or len(closes) < MIN_HISTORY_DAYS:
        return None

    prev_dollar_vols = dollar_vols[-MIN_HISTORY_DAYS:-1]
    if len(prev_dollar_vols) < 10:
        return None
    avg_dollar_vol10 = sum(prev_dollar_vols[-10:]) / 10.0
    dollar_vol_today = dollar_vols[-1]

    change5d: Optional[float] = None
    if len(closes) >= 6:
        base = closes[-6]
        if base:
            change5d = ((closes[-1] / base) - 1.0) * 100.0

    dollar_vol5d: Optional[float] = None
    if len(dollar_vols) >= 5:
        dollar_vol5d = sum(dollar_vols[-5:])

    if len(closes) < 2:
        return None

    prev_close = closes[-2]
    change1d = ((closes[-1] / prev_close) - 1.0) * 100.0 if prev_close else None

    rel_vol10 = None
    if avg_dollar_vol10:
        rel_vol10 = dollar_vol_today / avg_dollar_vol10 if avg_dollar_vol10 != 0 else None

    history_window = 30
    history_entries: List[Dict[str, float]] = []
    for date_str, close_val, volume_val, dollar_val in zip(
        dates[-history_window:], closes[-history_window:], volumes[-history_window:], dollar_vols[-history_window:]
    ):
        history_entries.append(
            {
                "date": date_str,
                "close": close_val,
                "volume": volume_val,
                "dollarVolume": dollar_val,
            }
        )

    adr20_pct = None
    if len(range_ratios) >= 20:
        recent = range_ratios[-20:]
        avg_ratio = sum(recent) / len(recent)
        adr20_pct = (avg_ratio - 1.0) * 100.0

    return TickerMetric(
        symbol=str(symbol).strip().upper(),
        last_date=dates[-1],
        dollar_vol_today=dollar_vol_today,
        avg_dollar_vol10=avg_dollar_vol10,
        rel_vol10=rel_vol10,
        change1d=change1d,
        change5d=change5d,
        dollar_vol5d=dollar_vol5d,
        history=history_entries,
        adr20_pct=adr20_pct,
        ytd_gain_to_high_pct=ytd_gain,
        ytd_off_high_pct=ytd_off,
        ralph_score=ralph_score,
    )


def _load_metrics_from_json() -> Tuple[Dict[str, TickerMetric], Set[str]]:
    if not LATEST_SNAPSHOT_JSON.exists():
        return {}, set()

    try:
        payload = json.loads(LATEST_SNAPSHOT_JSON.read_text())
    except json.JSONDecodeError:
        return {}, set()

    metrics_payload = payload.get("ticker_metrics")
    if not isinstance(metrics_payload, dict):
        return {}, set()

    metrics: Dict[str, TickerMetric] = {}
    for symbol, data in metrics_payload.items():
        if not isinstance(data, dict):
            continue
        metrics[symbol] = TickerMetric(
            symbol=symbol,
            last_date=data.get("last_date"),
            dollar_vol_today=_safe_float(data.get("dollar_vol_today")),
            avg_dollar_vol10=_safe_float(data.get("avg_dollar_vol10")),
            rel_vol10=_safe_float(data.get("rel_vol10")),
            change1d=_safe_float(data.get("change1d")),
            change5d=_safe_float(data.get("change5d")),
            adr20_pct=_safe_float(data.get("adr20_pct")),
            dollar_vol5d=_safe_float(data.get("dollar_vol5d")),
            history=[
                {
                    "date": str(item.get("date")),
                    "close": _safe_float(item.get("close")),
                    "volume": _safe_float(item.get("volume")),
                    "dollarVolume": _safe_float(item.get("dollarVolume")),
                }
                for item in data.get("history", [])
                if isinstance(item, dict)
            ],
            ytd_gain_to_high_pct=_safe_float(data.get("ytd_gain_to_high_pct")),
            ytd_off_high_pct=_safe_float(data.get("ytd_off_high_pct")),
            ralph_score=_safe_float(data.get("ralph_score")),
        )
    inactive_payload = payload.get("inactive_tickers")
    inactive_rows: List[tuple] = []
    if isinstance(inactive_payload, list):
        for entry in inactive_payload:
            if not isinstance(entry, dict):
                continue
            symbol = entry.get("symbol")
            failure_count = entry.get("failure_count")
            last_failure = entry.get("last_failure")
            inactive_rows.append((symbol, failure_count, last_failure))

    return metrics, _determine_inactive(inactive_rows)


def load_latest_metrics_snapshot() -> Tuple[Dict[str, TickerMetric], Set[str]]:
    metrics, inactive = _load_metrics_from_db()
    if metrics:
        return metrics, inactive

    metrics, inactive = _load_metrics_from_json()
    if metrics:
        return metrics, inactive

    raise SnapshotNotFoundError("Sector snapshot not found in DuckDB or JSON fallback")


def load_snapshot_payload() -> Dict[str, Any]:
    if not LATEST_SNAPSHOT_JSON.exists():
        raise SnapshotNotFoundError("Snapshot JSON not found")
    try:
        return json.loads(LATEST_SNAPSHOT_JSON.read_text())
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise SnapshotNotFoundError("Snapshot JSON corrupted") from exc


def aggregate_sectors(
    sectors: List[SectorIn],
    metrics: Dict[str, TickerMetric],
    inactive_symbols: Optional[Set[str]] = None,
) -> List[SectorVolumeDTO]:
    inactive_symbols = inactive_symbols or set()
    results: List[SectorVolumeDTO] = []

    for sector in sectors:
        members = [ticker.strip().upper() for ticker in sector.tickers if ticker.strip()]
        active_members = [sym for sym in members if sym not in inactive_symbols]
        included_symbols = [sym for sym in active_members if sym in metrics]

        if not included_symbols:
            results.append(
                SectorVolumeDTO(
                    id=sector.id,
                    name=sector.name,
                    members=active_members,
                    leaders=[],
                )
            )
            continue

        rel_values: List[float] = []
        change_values: List[float] = []
        sum_today = 0.0
        today_count = 0
        sum_avg10 = 0.0
        avg10_count = 0
        last_dates: List[str] = []
        leaders: List[TickerLeaderDTO] = []

        members_detail: List[TickerMetricDTO] = []
        weighted_sum = 0.0
        weighted_total = 0.0
        weighted_sum_5d = 0.0
        weighted_total_5d = 0.0

        for symbol in active_members:
            metric = metrics.get(symbol)
            if metric is None:
                members_detail.append(
                    TickerMetricDTO(
                        ticker=symbol,
                        inactive=symbol in inactive_symbols,
                    )
                )
                continue

            metric_rel = metric.rel_vol10
            metric_change = metric.change1d

            if symbol in included_symbols:
                if metric_rel is not None:
                    rel_values.append(metric_rel)
                    leaders.append(
                        TickerLeaderDTO(
                            ticker=symbol,
                            relVol10=metric_rel,
                            change1d=metric_change,
                        )
                    )
                else:
                    leaders.append(
                        TickerLeaderDTO(
                            ticker=symbol,
                            relVol10=None,
                            change1d=metric_change,
                        )
                    )

                if metric_change is not None:
                    change_values.append(metric_change)
                    if metric.dollar_vol_today is not None and metric.dollar_vol_today > 0:
                        weighted_sum += metric_change * metric.dollar_vol_today
                        weighted_total += metric.dollar_vol_today

                if metric.dollar_vol_today is not None:
                    sum_today += metric.dollar_vol_today
                    today_count += 1

                if metric.avg_dollar_vol10 is not None:
                    sum_avg10 += metric.avg_dollar_vol10
                    avg10_count += 1

                if metric.last_date:
                    last_dates.append(metric.last_date)

            metric_change5d = metric.change5d
            if metric_change5d is None:
                metric_change5d = _compute_price_change(metric.history, periods=5)

            metric_dollar_vol5d = metric.dollar_vol5d
            if metric_dollar_vol5d is None:
                metric_dollar_vol5d = _compute_dollar_volume(metric.history, window=5)

            if (
                metric_change5d is not None
                and metric_dollar_vol5d is not None
                and metric_dollar_vol5d > 0
            ):
                weighted_sum_5d += metric_change5d * metric_dollar_vol5d
                weighted_total_5d += metric_dollar_vol5d

            members_detail.append(
                TickerMetricDTO(
                    ticker=symbol,
                    change1d=metric_change,
                    change5d=metric_change5d,
                    relVol10=metric_rel,
                    dollarVolToday=metric.dollar_vol_today,
                    avgDollarVol10=metric.avg_dollar_vol10,
                    lastUpdated=metric.last_date,
                    dollarVol5d=metric_dollar_vol5d,
                    adr20Pct=metric.adr20_pct,
                    ytdGainToHighPct=metric.ytd_gain_to_high_pct,
                    ytdOffHighPct=metric.ytd_off_high_pct,
                    ralphScore=metric.ralph_score,
                    inactive=False,
                    history=[
                        {
                            "date": entry.get("date", ""),
                            "close": entry.get("close"),
                            "volume": entry.get("volume"),
                            "dollarVolume": entry.get("dollarVolume"),
                        }
                        for entry in metric.history
                    ],
                )
            )

        # Include any members that were excluded due to inactivity or missing data
        missing_members = [sym for sym in members if sym not in active_members]
        for symbol in missing_members:
            members_detail.append(
                TickerMetricDTO(
                    ticker=symbol,
                    inactive=True,
                )
            )

        leaders = [
            leader
            for leader in leaders
            if leader.relVol10 is not None
        ]
        leaders.sort(key=lambda l: l.relVol10 if l.relVol10 is not None else float("-inf"), reverse=True)
        leaders = leaders[:3]

        rel_median = _safe_median(rel_values)
        change_median = _safe_median(change_values)
        change_weighted = (weighted_sum / weighted_total) if weighted_total else None
        change5d_weighted = (weighted_sum_5d / weighted_total_5d) if weighted_total_5d else None
        results.append(
            SectorVolumeDTO(
                id=sector.id,
                name=sector.name,
                members=active_members,
                relVol10_median=rel_median,
                dollarVol_today_sum=sum_today if today_count else None,
                avgDollarVol10_sum=sum_avg10 if avg10_count else None,
                change1d_median=change_median,
                change1d_weighted=change_weighted,
                change5d_weighted=change5d_weighted,
                leaders=leaders,
                lastUpdated=max(last_dates) if last_dates else None,
                members_detail=members_detail,
            )
        )

    return results


SectorRowDTO = SectorVolumeDTO


def recompute_sector(sector_id: str, conn: duckdb.DuckDBPyConnection) -> SectorRowDTO:
    sector_key = str(sector_id).strip()
    if not sector_key:
        raise SnapshotNotFoundError("Sector identifier is required.")

    try:
        row = conn.execute(
            """
            SELECT name
            FROM sector_definitions
            WHERE sector_id = ?
            """,
            (sector_key,),
        ).fetchone()
    except duckdb.Error as exc:
        raise SnapshotNotFoundError(f"Unable to load sector definition for {sector_key}") from exc

    if row is None:
        raise SnapshotNotFoundError(f"Sector '{sector_key}' not found.")

    sector_name = row[0] if row and row[0] else sector_key

    try:
        member_rows = conn.execute(
            """
            SELECT symbol
            FROM sectors_map
            WHERE sector_id = ?
            ORDER BY symbol
            """,
            (sector_key,),
        ).fetchall()
    except duckdb.Error as exc:
        raise SnapshotNotFoundError(f"Unable to load sector members for {sector_key}") from exc

    members: List[str] = [
        str(symbol).strip().upper()
        for (symbol,) in member_rows
        if symbol and str(symbol).strip()
    ]

    sector_input = SectorIn(id=sector_key, name=str(sector_name), tickers=members)

    metrics = _load_metrics_for_symbols(conn, members)
    for symbol in members:
        if symbol not in metrics:
            metric = _compute_metric_from_ohlc(conn, symbol)
            if metric:
                metrics[symbol] = metric

    inactive_symbols = _load_inactive_symbols(conn)

    aggregated = aggregate_sectors([sector_input], metrics, inactive_symbols)
    if not aggregated:
        return SectorVolumeDTO(id=sector_input.id, name=sector_input.name, members=[])
    return aggregated[0]


def compute_snapshot_metadata(payload: Mapping[str, Any]) -> Dict[str, Any]:
    snapshot_date = payload.get("snapshot_date")
    generated_at_str = payload.get("generated_at")

    generated_dt_utc: Optional[datetime] = None
    if isinstance(generated_at_str, str):
        try:
            generated_dt_utc = datetime.fromisoformat(generated_at_str)
        except ValueError:
            generated_dt_utc = None
        if generated_dt_utc and generated_dt_utc.tzinfo is None:
            generated_dt_utc = generated_dt_utc.replace(tzinfo=timezone.utc)

    if generated_dt_utc:
        age = datetime.now(timezone.utc) - generated_dt_utc.astimezone(timezone.utc)
        stale = age > timedelta(hours=24)
        if EASTERN_TZ is not None:
            as_of_time_et = generated_dt_utc.astimezone(EASTERN_TZ).strftime("%H:%M:%S")
        else:  # pragma: no cover - missing tzdata
            as_of_time_et = None
    else:
        as_of_time_et = None
        stale = True

    sectors_data = payload.get("sectors")
    sectors_count = len(sectors_data) if isinstance(sectors_data, list) else 0
    members_count = 0
    if isinstance(sectors_data, list):
        for entry in sectors_data:
            if isinstance(entry, dict):
                members = entry.get("members")
                if isinstance(members, list):
                    members_count += len(members)

    return {
        "asOfDate": snapshot_date,
        "asOfTimeET": as_of_time_et,
        "sectors_count": sectors_count,
        "members_count": members_count,
        "stale": stale,
    }


def _ensure_writable_dir(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError:
        return False
    fd = None
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(dir=str(path))
    except OSError:
        return False
    finally:
        if fd is not None:
            os.close(fd)
        if tmp_path is not None:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
    return True


def _snapshot_temp_root() -> Path:
    candidates: List[Path] = []

    def _add_candidate(raw: Optional[str]) -> None:
        if not raw:
            return
        candidate = Path(raw).expanduser()
        if candidate not in candidates:
            candidates.append(candidate)

    _add_candidate(os.environ.get("SNAPSHOT_TMP_DIR"))

    try:
        config = load_config()
    except Exception:
        config = {}
    snapshot_cfg = config.get("snapshot")
    if isinstance(snapshot_cfg, dict):
        cfg_path = snapshot_cfg.get("tmp_dir")
        if isinstance(cfg_path, str) and cfg_path.strip():
            _add_candidate(cfg_path.strip())

    _add_candidate(os.environ.get("TMPDIR"))
    _add_candidate("var/tmp")

    for candidate in candidates:
        if _ensure_writable_dir(candidate):
            return candidate

    fallback = Path("var/tmp")
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


def _fsync_directory(path: Path) -> None:
    flags = getattr(os, "O_RDONLY", 0)
    if hasattr(os, "O_DIRECTORY"):
        flags |= os.O_DIRECTORY
    try:
        dir_fd = os.open(str(path), flags)
    except OSError:
        return
    try:
        os.fsync(dir_fd)
    except OSError:
        pass
    finally:
        os.close(dir_fd)


def _atomic_write_file(path: Path, data: bytes) -> None:
    temp_root = _snapshot_temp_root()
    temp_root.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=f"{path.name}.", dir=str(temp_root))
    try:
        with os.fdopen(fd, "wb") as tmp_file:
            tmp_file.write(data)
            tmp_file.flush()
            os.fsync(tmp_file.fileno())
        path.parent.mkdir(parents=True, exist_ok=True)
        os.replace(tmp_path, path)
        _fsync_directory(path.parent)
    finally:
        try:
            os.remove(tmp_path)
        except FileNotFoundError:
            pass


def _patch_latest_snapshot_sync(updated_row: SectorRowDTO) -> None:
    payload = load_snapshot_payload()
    sectors_payload = payload.get("sectors")
    if not isinstance(sectors_payload, list):
        sectors_payload = []

    row_data = updated_row.model_dump()
    sector_id = row_data.get("id")
    if not isinstance(sector_id, str) or not sector_id.strip():
        raise SnapshotNotFoundError("Updated sector row must include a valid 'id'.")

    new_sectors: List[Dict[str, Any]] = []
    replaced = False
    for entry in sectors_payload:
        if isinstance(entry, dict) and entry.get("id") == sector_id:
            new_sectors.append(row_data)
            replaced = True
        elif isinstance(entry, dict):
            new_sectors.append(entry)
    if not replaced:
        new_sectors.append(row_data)

    payload["sectors"] = new_sectors
    payload["sectors_count"] = len(new_sectors)
    payload["members_count"] = sum(
        len(entry.get("members", [])) for entry in new_sectors if isinstance(entry, dict)
    )

    ticker_metrics_payload = payload.get("ticker_metrics")
    if not isinstance(ticker_metrics_payload, dict):
        ticker_metrics_payload = {}
    for member in row_data.get("members_detail", []):
        if not isinstance(member, dict):
            continue
        if member.get("inactive"):
            continue
        ticker = member.get("ticker")
        if not isinstance(ticker, str) or not ticker.strip():
            continue
        ticker_key = ticker.strip().upper()
        ticker_metrics_payload[ticker_key] = {
            "last_date": member.get("lastUpdated"),
            "dollar_vol_today": member.get("dollarVolToday"),
            "avg_dollar_vol10": member.get("avgDollarVol10"),
            "rel_vol10": member.get("relVol10"),
            "change1d": member.get("change1d"),
            "change5d": member.get("change5d"),
            "adr20_pct": member.get("adr20Pct"),
            "dollar_vol5d": member.get("dollarVol5d"),
            "history": member.get("history", []),
        }
    payload["ticker_metrics"] = ticker_metrics_payload

    generated_at_dt = datetime.now(timezone.utc)
    payload["generated_at"] = generated_at_dt.isoformat()

    json_bytes = json.dumps(payload, indent=2, sort_keys=True).encode("utf-8")
    _atomic_write_file(LATEST_SNAPSHOT_JSON, json_bytes)
    checksum = hashlib.sha256(json_bytes).hexdigest().encode("ascii") + b"\n"
    checksum_path = SNAPSHOT_CHECKSUM_DIR / f"{LATEST_SNAPSHOT_JSON.name}.sha256"
    _atomic_write_file(checksum_path, checksum)

    snapshot_date = payload.get("snapshot_date")
    if snapshot_date:
        try:
            conn = duckdb.connect(str(SNAPSHOT_DB))
        except duckdb.Error:
            conn = None
        if conn is not None:
            try:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO sector_snapshot (snapshot_date, generated_at, payload)
                    VALUES (?, ?, ?)
                    """,
                    (snapshot_date, generated_at_dt, json.dumps(payload, sort_keys=True)),
                )
            except duckdb.Error:
                pass
            finally:
                conn.close()


async def patch_latest_snapshot(updated_row: SectorRowDTO) -> None:
    async with SNAPSHOT_WRITE_LOCK:
        await asyncio.to_thread(_patch_latest_snapshot_sync, updated_row)


def _safe_median(values: List[float]) -> Optional[float]:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return float(median(clean))


def _compute_price_change(history: List[Dict[str, float]], periods: int) -> Optional[float]:
    if periods <= 0 or not history:
        return None
    closes = [
        float(entry.get("close"))
        for entry in history
        if isinstance(entry, dict) and isinstance(entry.get("close"), (int, float))
    ]
    if len(closes) <= periods:
        return None
    base = closes[-periods - 1]
    latest = closes[-1]
    if base == 0:
        return None
    return ((latest / base) - 1.0) * 100.0


def _compute_dollar_volume(history: List[Dict[str, float]], window: int) -> Optional[float]:
    if window <= 0 or not history:
        return None
    dollar_volumes = [
        float(entry.get("dollarVolume"))
        for entry in history
        if isinstance(entry, dict) and isinstance(entry.get("dollarVolume"), (int, float))
    ]
    if len(dollar_volumes) < window:
        return None
    return sum(dollar_volumes[-window:])


__all__ = [
    "TickerMetric",
    "SnapshotNotFoundError",
    "load_latest_metrics_snapshot",
    "load_snapshot_payload",
    "aggregate_sectors",
    "SectorRowDTO",
    "recompute_sector",
    "patch_latest_snapshot",
    "get_sector_lock",
    "compute_snapshot_metadata",
    "compute_ytd_ralph_metrics",
]
