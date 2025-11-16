from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

import duckdb  # type: ignore[import]

from app.services import sector_snapshot

_PERIOD_TO_DAYS = {
    "5d": 7,
    "1mo": 32,
    "3mo": 92,
    "6mo": 185,
    "1y": 370,
    "2y": 740,
    "5y": 1850,
    "10y": 3650,
    "max": 5000,
}


def _coerce_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return None
        return parsed.date()
    return None


def period_start(period: Optional[str]) -> Optional[date]:
    if not period:
        return None
    key = period.lower()
    days = _PERIOD_TO_DAYS.get(key)
    if days is None:
        try:
            if key.endswith("d"):
                days = max(1, int(key[:-1]))
            elif key.endswith("mo"):
                days = max(1, int(key[:-2]) * 31)
            elif key.endswith("y"):
                days = max(1, int(key[:-1]) * 365)
        except (TypeError, ValueError):
            days = None
    if days is None:
        return None
    return date.today() - timedelta(days=days)


def get_daily_eod(symbol: str, start: Optional[Any] = None, end: Optional[Any] = None) -> List[Dict[str, Any]]:
    sym = symbol.strip().upper()
    if not sym:
        return []
    if not sector_snapshot.SNAPSHOT_DB.exists():
        return []

    start_date = _coerce_date(start)
    end_date = _coerce_date(end)

    query = [
        "SELECT date, open, high, low, close, volume, dollar_volume",
        "FROM ticker_ohlc",
        "WHERE symbol = ?",
    ]
    params: List[Any] = [sym]
    if start_date:
        query.append("AND date >= ?")
        params.append(start_date)
    if end_date:
        query.append("AND date <= ?")
        params.append(end_date)
    query.append("ORDER BY date")
    sql = " ".join(query)

    records: List[Dict[str, Any]] = []
    conn = duckdb.connect(str(sector_snapshot.SNAPSHOT_DB))
    try:
        rows = conn.execute(sql, params).fetchall()
    except duckdb.Error:
        conn.close()
        return []
    finally:
        conn.close()

    for dt_value, open_px, high_px, low_px, close_px, volume, dollar_volume in rows:
        date_value = dt_value
        if isinstance(date_value, datetime):
            date_field = date_value
        elif isinstance(date_value, date):
            date_field = datetime.combine(date_value, datetime.min.time())
        else:
            try:
                date_field = datetime.fromisoformat(str(date_value))
            except ValueError:
                date_field = datetime.min
        records.append(
            {
                "Date": date_field,
                "Open": open_px,
                "High": high_px,
                "Low": low_px,
                "Close": close_px,
                "Volume": volume,
                "DollarVolume": dollar_volume,
            }
        )
    return records


__all__ = ["get_daily_eod", "period_start"]
