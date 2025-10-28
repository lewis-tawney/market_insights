from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from statistics import median
from typing import Any, Dict, List, Optional, Set, Tuple

import duckdb  # type: ignore[import]

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

FAILURE_THRESHOLD = 3
FAILURE_WINDOW_DAYS = 30


class SnapshotNotFoundError(Exception):
    """Raised when no sector volume snapshot is available."""


@dataclass
class TickerMetric:
    symbol: str
    last_date: Optional[str]
    dollar_vol_today: Optional[float]
    avg_dollar_vol10: Optional[float]
    rel_vol10: Optional[float]
    change1d: Optional[float]
    history: List[Dict[str, float]]


def _load_metrics_from_db() -> Tuple[Dict[str, TickerMetric], Set[str]]:
    if not SNAPSHOT_DB.exists():
        return {}, set()

    conn = duckdb.connect(str(SNAPSHOT_DB), read_only=True)
    try:
        rows = conn.execute(
            """
           SELECT symbol,
                  CAST(last_date AS VARCHAR) AS last_date,
                  dollar_vol_today,
                  avg_dollar_vol10,
                   rel_vol10,
                   change1d,
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
            history=parsed_history,
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
        five_day_changes: List[float] = []

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

                if metric.dollar_vol_today is not None:
                    sum_today += metric.dollar_vol_today
                    today_count += 1

                if metric.avg_dollar_vol10 is not None:
                    sum_avg10 += metric.avg_dollar_vol10
                    avg10_count += 1

                if metric.last_date:
                    last_dates.append(metric.last_date)

            history = metric.history
            if history:
                five_day = _compute_history_change(history, periods=5)
                if five_day is not None:
                    five_day_changes.append(five_day)

            members_detail.append(
                TickerMetricDTO(
                    ticker=symbol,
                    change1d=metric_change,
                    relVol10=metric_rel,
                    dollarVolToday=metric.dollar_vol_today,
                    avgDollarVol10=metric.avg_dollar_vol10,
                    lastUpdated=metric.last_date,
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
        results.append(
            SectorVolumeDTO(
                id=sector.id,
                name=sector.name,
                members=active_members,
                relVol10_median=rel_median,
                dollarVol_today_sum=sum_today if today_count else None,
                avgDollarVol10_sum=sum_avg10 if avg10_count else None,
                change1d_median=change_median,
                leaders=leaders,
                lastUpdated=max(last_dates) if last_dates else None,
                members_detail=members_detail,
            )
        )

    return results


def _safe_median(values: List[float]) -> Optional[float]:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return float(median(clean))


def _compute_history_change(history: List[Dict[str, float]], periods: int) -> Optional[float]:
    if periods <= 0 or not history:
        return None
    closes: List[float] = []
    for entry in history:
        close = entry.get("close")
        if isinstance(close, (int, float)) and not isinstance(close, bool):
            closes.append(float(close))
    if len(closes) <= periods:
        return None
    start = closes[-periods - 1]
    end = closes[-1]
    if start == 0:
        return None
    return ((end / start) - 1.0) * 100.0


__all__ = [
    "TickerMetric",
    "SnapshotNotFoundError",
    "load_latest_metrics_snapshot",
    "load_snapshot_payload",
    "aggregate_sectors",
]
