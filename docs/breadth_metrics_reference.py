"""Reference implementation of Stockbee breadth metrics.

This module is not imported by the live application. It preserves the logic for
computing the Stockbee-style breadth counts so we can reintroduce the breadth
dataset in the future without rebuilding the formulas from scratch.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

import pandas as pd


@dataclass(frozen=True)
class BreadthRules:
    """Thresholds used when tagging symbol-level breadth events."""

    min_price: float = 1.0
    min_dollar_volume: float = 250_000.0
    min_volume: int = 100_000
    dv20_floor_usd: float = 2_500_000.0
    epsilon: float = 0.01


SYMBOL_COLUMNS: List[str] = [
    "date",
    "n_elig",
    "n_up4",
    "n_dn4",
    "n_up25m",
    "n_dn25m",
    "n_up50m",
    "n_dn50m",
    "n_up25q",
    "n_dn25q",
    "n_up13x34",
    "n_dn13x34",
]

DAILY_COLUMNS: List[str] = [
    "date",
    "n_elig",
    "n_up4",
    "n_dn4",
    "up10",
    "dn10",
    "r5",
    "r10",
    "n_up25m",
    "n_dn25m",
    "n_up50m",
    "n_dn50m",
    "n_up25q",
    "n_dn25q",
    "n_up13x34",
    "n_dn13x34",
    "d34_13",
]


def compute_symbol_flags(
    df: pd.DataFrame, rules: BreadthRules | None = None
) -> pd.DataFrame:
    """Tag a single symbol's history with Stockbee breadth signals.

    Expects columns ``date``, ``close``, and ``volume`` with ascending dates.
    Returns a DataFrame with the columns listed in ``SYMBOL_COLUMNS`` where each
    field is 0/1 counting the presence of that signal on the given date.
    """

    if df.empty:
        return pd.DataFrame(columns=SYMBOL_COLUMNS)

    rules = rules or BreadthRules()
    work = df.copy()
    work["date"] = pd.to_datetime(work["date"]).dt.date
    close = work["close"].astype(float)
    volume = work["volume"].astype(float)

    prev_close = close.shift(1)
    prev_volume = volume.shift(1)

    daily_return = close / prev_close - 1.0
    dollar_volume = close * volume

    eligible = (close >= rules.min_price) & (
        (dollar_volume >= rules.min_dollar_volume) | (volume >= rules.min_volume)
    )

    up4 = eligible & (daily_return >= 0.04) & (volume > prev_volume)
    dn4 = eligible & (daily_return <= -0.04) & (volume > prev_volume)

    close20 = close.shift(20)
    dv20 = (close * volume).rolling(20, min_periods=20).mean()
    dv20_ok = dv20 >= rules.dv20_floor_usd

    up25m = eligible & dv20_ok & ((close / close20 - 1.0) >= 0.25)
    dn25m = eligible & dv20_ok & ((close / close20 - 1.0) <= -0.25)
    up50m = eligible & dv20_ok & ((close / close20 - 1.0) >= 0.50)
    dn50m = eligible & dv20_ok & ((close / close20 - 1.0) <= -0.50)

    minc65 = close.rolling(65, min_periods=65).min()
    maxc65 = close.rolling(65, min_periods=65).max()
    eps = rules.epsilon
    up25q = eligible & dv20_ok & (((close + eps) / (minc65 + eps) - 1.0) >= 0.25)
    dn25q = eligible & dv20_ok & (((close + eps) / (maxc65 + eps) - 1.0) <= -0.25)

    minc34 = close.rolling(34, min_periods=34).min()
    maxc34 = close.rolling(34, min_periods=34).max()
    up13x34 = eligible & dv20_ok & (((close + eps) / (minc34 + eps) - 1.0) >= 0.13)
    dn13x34 = eligible & dv20_ok & (((close + eps) / (maxc34 + eps) - 1.0) <= -0.13)

    return pd.DataFrame(
        {
            "date": work["date"],
            "n_elig": eligible.astype("int32"),
            "n_up4": up4.astype("int32"),
            "n_dn4": dn4.astype("int32"),
            "n_up25m": up25m.astype("int32"),
            "n_dn25m": dn25m.astype("int32"),
            "n_up50m": up50m.astype("int32"),
            "n_dn50m": dn50m.astype("int32"),
            "n_up25q": up25q.astype("int32"),
            "n_dn25q": dn25q.astype("int32"),
            "n_up13x34": up13x34.astype("int32"),
            "n_dn13x34": dn13x34.astype("int32"),
        }
    )


def aggregate_daily(symbol_frames: Iterable[pd.DataFrame]) -> pd.DataFrame:
    """Aggregate symbol-level breadth flags into daily breadth metrics."""

    frames = [df for df in symbol_frames if not df.empty]
    if not frames:
        return pd.DataFrame(columns=DAILY_COLUMNS)

    merged = pd.concat(frames, ignore_index=True)
    daily = (
        merged.groupby("date", as_index=False)
        .sum(numeric_only=True)
        .sort_values("date")
        .reset_index(drop=True)
    )

    daily["up10"] = daily["n_up4"].rolling(10, min_periods=1).sum().astype("int32")
    daily["dn10"] = daily["n_dn4"].rolling(10, min_periods=1).sum().astype("int32")
    daily["r5"] = (
        (daily["n_up4"].rolling(5, min_periods=1).sum() + 0.5)
        / (daily["n_dn4"].rolling(5, min_periods=1).sum() + 0.5)
    ).astype("float32")
    daily["r10"] = ((daily["up10"] + 0.5) / (daily["dn10"] + 0.5)).astype("float32")
    daily["d34_13"] = (daily["n_up13x34"] - daily["n_dn13x34"]).astype("int32")

    return daily[DAILY_COLUMNS].copy()
