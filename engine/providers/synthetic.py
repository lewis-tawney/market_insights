"""Synthetic market data generators used when live data is unavailable."""

from __future__ import annotations

import math
from datetime import datetime
from typing import Dict, Optional

import pandas as pd  # type: ignore[import]


def _period_to_days(period: str) -> int:
    p = (period or "").lower().strip()
    mapping = {
        "5d": 5,
        "10d": 10,
        "1mo": 30,
        "3mo": 90,
        "6mo": 180,
        "1y": 365,
        "2y": 730,
        "3y": 1095,
        "5y": 1825,
        "10y": 3650,
        "max": 1825,
    }
    if p in mapping:
        return mapping[p]
    if p.endswith("d") and p[:-1].isdigit():
        return max(int(p[:-1]), 5)
    if p.endswith("mo") and p[:-2].isdigit():
        return max(int(p[:-2]) * 30, 30)
    if p.endswith("y") and p[:-1].isdigit():
        return max(int(p[:-1]) * 365, 180)
    return 365


def _base_price(symbol: str) -> float:
    seed = abs(hash(symbol)) % 500
    return 40.0 + seed * 0.4


def generate_synthetic_history(
    symbol: str,
    period: str,
    interval: str,
) -> Optional[pd.DataFrame]:
    interval = (interval or "").lower()
    if interval != "1d":
        return None

    days = _period_to_days(period)
    length = max(60, min(days, 750))
    end = datetime.utcnow().date()
    index = pd.bdate_range(end=end, periods=length, tz=None)

    base = _base_price(symbol)
    rows = []
    for idx, ts in enumerate(index):
        drift = 0.15 * idx
        seasonal = 3.5 * math.sin(idx / 12.0)
        volatility = 2.0 * math.sin(idx / 5.0 + (abs(hash(symbol)) % 360) / 57.3)
        close = max(base + drift + seasonal + volatility, 5.0)
        open_price = round(close - 0.6, 2)
        close = round(close, 2)
        high = round(close + 0.9, 2)
        low = round(max(close - 0.9, 1.0), 2)
        volume = 800_000 + (abs(hash((symbol, idx))) % 1_000_000)
        rows.append(
            {
                "Date": ts.to_pydatetime().replace(tzinfo=None),
                "Open": open_price,
                "High": high,
                "Low": low,
                "Close": close,
                "Volume": float(volume),
            }
        )

    df = pd.DataFrame(rows).set_index("Date")
    return df


def generate_synthetic_last_price(symbol: str) -> float:
    history = generate_synthetic_history(symbol, period="3mo", interval="1d")
    if history is None or history.empty:
        return _base_price(symbol)
    return float(history["Close"].iloc[-1])


def generate_synthetic_vix_term() -> Dict[str, float]:
    now = datetime.utcnow()
    base = 18.0 + 2.5 * math.sin(now.timetuple().tm_yday / 58.0)
    spot = max(base, 12.0)
    nine_day = max(spot - 2.0, 10.0)
    three_month = spot + 3.0
    return {"^VIX9D": round(nine_day, 2), "^VIX": round(spot, 2), "^VIX3M": round(three_month, 2)}
