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
    spark_series: List[Dict[str, float]]


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
                   spark10
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
        spark_json,
    ) in rows:
        try:
            spark_data = json.loads(spark_json) if spark_json else []
        except json.JSONDecodeError:
            spark_data = []

        parsed_entries: List[Dict[str, float]] = []
        for entry in spark_data:
            if not isinstance(entry, dict):
                continue
            date = entry.get("date")
            change = entry.get("change")
            if isinstance(date, str) and isinstance(change, (int, float)):
                parsed_entries.append({"date": date, "change": float(change)})

        metrics[symbol] = TickerMetric(
            symbol=symbol,
            last_date=last_date if last_date else None,
            dollar_vol_today=_safe_float(dollar_vol_today),
            avg_dollar_vol10=_safe_float(avg_dollar_vol10),
            rel_vol10=_safe_float(rel_vol10),
            change1d=_safe_float(change1d),
            spark_series=parsed_entries,
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
        spark_raw = data.get("spark10") or []
        parsed_entries: List[Dict[str, float]] = []
        if isinstance(spark_raw, list):
            for entry in spark_raw:
                if (
                    isinstance(entry, dict)
                    and isinstance(entry.get("date"), str)
                    and isinstance(entry.get("change"), (int, float))
                ):
                    parsed_entries.append(
                        {"date": entry["date"], "change": float(entry["change"])}
                    )
        metrics[symbol] = TickerMetric(
            symbol=symbol,
            last_date=data.get("last_date"),
            dollar_vol_today=_safe_float(data.get("dollar_vol_today")),
            avg_dollar_vol10=_safe_float(data.get("avg_dollar_vol10")),
            rel_vol10=_safe_float(data.get("rel_vol10")),
            change1d=_safe_float(data.get("change1d")),
            spark_series=parsed_entries,
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
                    spark10=[],
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
        per_date_changes: Dict[str, List[float]] = {}
        leaders: List[TickerLeaderDTO] = []

        for symbol in included_symbols:
            metric = metrics[symbol]

            if metric.rel_vol10 is not None:
                rel_values.append(metric.rel_vol10)
                leaders.append(
                    TickerLeaderDTO(
                        ticker=symbol,
                        relVol10=metric.rel_vol10,
                        change1d=metric.change1d,
                    )
                )
            else:
                leaders.append(
                    TickerLeaderDTO(
                        ticker=symbol,
                        relVol10=None,
                        change1d=metric.change1d,
                    )
                )

            if metric.change1d is not None:
                change_values.append(metric.change1d)

            if metric.dollar_vol_today is not None:
                sum_today += metric.dollar_vol_today
                today_count += 1

            if metric.avg_dollar_vol10 is not None:
                sum_avg10 += metric.avg_dollar_vol10
                avg10_count += 1

            if metric.last_date:
                last_dates.append(metric.last_date)

            for entry in metric.spark_series:
                date_key = entry.get("date")
                change_val = entry.get("change")
                if (
                    isinstance(date_key, str)
                    and isinstance(change_val, (int, float))
                ):
                    per_date_changes.setdefault(date_key, []).append(float(change_val))

        leaders = [
            leader
            for leader in leaders
            if leader.relVol10 is not None
        ]
        leaders.sort(key=lambda l: l.relVol10 if l.relVol10 is not None else float("-inf"), reverse=True)
        leaders = leaders[:3]

        rel_median = _safe_median(rel_values)
        change_median = _safe_median(change_values)

        dates_sorted = sorted(per_date_changes.keys())
        spark10_values: List[float] = []
        for date_key in dates_sorted[-10:]:
            values = per_date_changes.get(date_key, [])
            if values:
                spark10_values.append(float(median(values)))

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
                spark10=spark10_values,
                lastUpdated=max(last_dates) if last_dates else None,
            )
        )

    return results


def _safe_median(values: List[float]) -> Optional[float]:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return float(median(clean))


__all__ = [
    "TickerMetric",
    "SnapshotNotFoundError",
    "load_latest_metrics_snapshot",
    "load_snapshot_payload",
    "aggregate_sectors",
]
