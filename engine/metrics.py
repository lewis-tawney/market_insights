from __future__ import annotations

from typing import List, Optional


def sma(series: List[float], n: int) -> List[Optional[float]]:
    out: List[Optional[float]] = []
    s = 0.0
    for i, v in enumerate(series):
        s += v
        if i >= n:
            s -= series[i - n]
        out.append(s / n if i >= n - 1 else None)
    return out


def slope(series: List[float], n: int) -> Optional[float]:
    sm = sma(series, n)
    if len(sm) < n + 5 or sm[-1] is None or sm[-6] is None:
        return None
    return (sm[-1] - sm[-6]) / 5.0


def ret(series: List[float], lookback: int) -> Optional[float]:
    if len(series) <= lookback:
        return None
    prev = series[-lookback - 1]
    if prev == 0:
        return None
    return series[-1] / prev - 1.0


def rolling_max(series: List[float], n: int) -> Optional[float]:
    if len(series) < n:
        return None
    return max(series[-n:])


def pct_above_ma(series: List[float], n: int) -> Optional[float]:
    sm = sma(series, n)
    if not sm or sm[-1] is None or sm[-1] == 0:
        return None
    return series[-1] / sm[-1] - 1.0
