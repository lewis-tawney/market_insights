from __future__ import annotations

from typing import Dict, List, Optional
from datetime import datetime, time
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd  # type: ignore[import]
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

router = APIRouter(prefix="/metrics", tags=["metrics"])


# ---------------- DTOs ----------------
class TrendDTO(BaseModel):
    symbol: str
    as_of: Optional[str]
    price: Optional[float]
    sma10: Optional[float]
    sma20: Optional[float]
    sma50: Optional[float]
    sma200: Optional[float]
    ema9: Optional[float]
    ema21: Optional[float]
    slope10: Optional[float]
    slope20: Optional[float]
    slope50: Optional[float]
    slope200: Optional[float]
    above10: Optional[bool]
    above20: Optional[bool]
    above50: Optional[bool]
    above200: Optional[bool]
    # helpful extra for daily % change on frontend
    prev_close: Optional[float] = None


class MomentumDTO(BaseModel):
    symbol: str
    as_of: Optional[str]
    r5d_pct: Optional[float]
    r1m_pct: Optional[float]
    r3m_pct: Optional[float]
    # Additional optional momentum context
    off_52w_high_pct: Optional[float] = None


class RsiDTO(BaseModel):
    symbol: str
    as_of: Optional[str]
    rsi: Optional[float]
    state: Optional[str]


class VixDTO(BaseModel):
    as_of: Optional[str]
    value: Optional[float]
    avg7: Optional[float]


class ReturnsDTO(BaseModel):
    MTD: Optional[float] = None
    YTD: Optional[float] = None


# ---------------- helpers ----------------
def _close_series_from_ohlc(records: List[Dict]) -> pd.Series:
    if not records:
        return pd.Series(dtype=float)
    df = pd.DataFrame(records)
    # Prefer an index if already present; else use Date column
    if "Date" in df.columns:
        df = df.set_index("Date")
    if hasattr(df.index, "tz"):
        try:
            df.index = df.index.tz_localize(None)
        except Exception:
            pass
    s = df["Close"].astype(float).dropna()
    s = s.sort_index()
    return s


def _sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(window=n, min_periods=n).mean()


def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def _slope_pct_per_day(x: pd.Series, n: int) -> Optional[float]:
    if len(x) < n + n:
        return None
    x_t = x.iloc[-1]
    x_tn = x.iloc[-1 - n]
    if x_tn == 0 or pd.isna(x_t) or pd.isna(x_tn):
        return None
    return float((x_t - x_tn) / x_tn / n)


def _provider(request: Request):
    return request.app.state.market


# ---------------- endpoints ----------------
@router.get("/trend", response_model=TrendDTO)
async def trend(symbol: str = Query(..., min_length=1), provider=Depends(_provider)):
    # Need ~200 trading days
    ohlc = await provider.get_ohlc(symbol, period="2y", interval="1d")
    s = _close_series_from_ohlc(ohlc)
    if s.empty:
        return TrendDTO(
            symbol=symbol.upper(),
            as_of=None,
            price=None,
            sma10=None,
            sma20=None,
            sma50=None,
            sma200=None,
            ema9=None,
            ema21=None,
            slope10=None,
            slope20=None,
            slope50=None,
            slope200=None,
            above10=None,
            above20=None,
            above50=None,
            above200=None,
        )
    sma10 = _sma(s, 10)
    sma20 = _sma(s, 20)
    sma50 = _sma(s, 50)
    sma200 = _sma(s, 200)
    ema9 = _ema(s, 9)
    ema21 = _ema(s, 21)
    price = float(s.iloc[-1])
    prev_close = float(s.iloc[-2]) if len(s) >= 2 else None
    dto = TrendDTO(
        symbol=symbol.upper(),
        as_of=s.index[-1].date().isoformat(),
        price=price,
        prev_close=prev_close,
        sma10=float(sma10.iloc[-1]) if not np.isnan(sma10.iloc[-1]) else None,
        sma20=float(sma20.iloc[-1]) if not np.isnan(sma20.iloc[-1]) else None,
        sma50=float(sma50.iloc[-1]) if not np.isnan(sma50.iloc[-1]) else None,
        sma200=float(sma200.iloc[-1]) if not np.isnan(sma200.iloc[-1]) else None,
        ema9=float(ema9.iloc[-1]) if not np.isnan(ema9.iloc[-1]) else None,
        ema21=float(ema21.iloc[-1]) if not np.isnan(ema21.iloc[-1]) else None,
        slope10=_slope_pct_per_day(sma10, 10),
        slope20=_slope_pct_per_day(sma20, 20),
        slope50=_slope_pct_per_day(sma50, 50),
        slope200=_slope_pct_per_day(sma200, 200),
        above10=bool(
            price
            > (float(sma10.iloc[-1]) if not np.isnan(sma10.iloc[-1]) else float("inf"))
        ),
        above20=bool(
            price
            > (float(sma20.iloc[-1]) if not np.isnan(sma20.iloc[-1]) else float("inf"))
        ),
        above50=bool(
            price
            > (float(sma50.iloc[-1]) if not np.isnan(sma50.iloc[-1]) else float("inf"))
        ),
        above200=bool(
            price
            > (
                float(sma200.iloc[-1])
                if not np.isnan(sma200.iloc[-1])
                else float("inf")
            )
        ),
    )
    return dto


@router.get("/momentum", response_model=MomentumDTO)
async def momentum(symbol: str = Query(..., min_length=1), provider=Depends(_provider)):
    # Use unadjusted OHLC to match most charting/quote sources for 52W High
    # and compute the 52W high from intraday High.
    ohlc = await provider.get_ohlc(symbol, period="12mo", interval="1d", auto_adjust=False)
    s = _close_series_from_ohlc(ohlc)
    # Build High series for intraday 52W high
    hs = pd.Series(dtype=float)
    if ohlc:
        dfh = pd.DataFrame(ohlc)
        if "Date" in dfh.columns:
            dfh = dfh.set_index("Date")
        if hasattr(dfh.index, "tz"):
            try:
                dfh.index = dfh.index.tz_localize(None)
            except Exception:
                pass
        if "High" in dfh.columns:
            hs = dfh["High"].astype(float).dropna().sort_index()

    # Determine the last full trading day index in the series. If the last
    # bar is for "today" but we are still prior to the US market close, treat
    # it as incomplete and exclude it from momentum calculations.
    def last_full_bar_index(series: pd.Series) -> int:
        if series.empty:
            return -1
        end_idx = len(series) - 1
        try:
            now_et = datetime.now(ZoneInfo("America/New_York"))
            last_ts = series.index[-1]
            # Convert to a python datetime for robust date comparison
            last_dt = (
                last_ts.to_pydatetime() if hasattr(last_ts, "to_pydatetime") else last_ts
            )
            if getattr(last_dt, "date", None) and last_dt.date() == now_et.date():
                # Consider the session complete only after the regular close
                if now_et.time() < time(16, 5):  # 4:05pm ET buffer
                    end_idx -= 1
        except Exception:
            # Best-effort only; if any issue, fall back to using the last bar
            pass
        return end_idx

    def pct(n: int) -> Optional[float]:
        end_idx = last_full_bar_index(s)
        if end_idx < 0 or (end_idx - n) < 0:
            return None
        base = s.iloc[end_idx - n]
        last = s.iloc[end_idx]
        if base == 0 or pd.isna(base) or pd.isna(last):
            return None
        return float(last / base - 1)

    off_52w_high_pct: Optional[float] = None
    if not s.empty:
        last_close = float(s.iloc[-1])
        # Use only highs up to the last full trading day to avoid including
        # an incomplete current session. Then restrict to the last 252 bars.
        try:
            end_idx = last_full_bar_index(s)
            end_dt = s.index[end_idx]
            hs_upto = hs.loc[:end_dt]
        except Exception:
            hs_upto = hs
        if not hs_upto.empty:
            windowed = hs_upto.tail(252)
            if not windowed.empty:
                hi = float(windowed.max())
                if hi and not pd.isna(hi) and hi != 0:
                    off_52w_high_pct = float(last_close / hi - 1)

    # Use the last full day as the as_of for momentum
    last_idx = None if s.empty else last_full_bar_index(s)
    as_of = (
        s.index[last_idx].date().isoformat() if (last_idx is not None and last_idx >= 0) else None
    )

    return MomentumDTO(
        symbol=symbol.upper(),
        as_of=as_of,
        # For 5D, include exactly the last 5 completed sessions (t vs t-4)
        r5d_pct=(
            (lambda: (
                (lambda end_idx: (
                    None
                    if end_idx < 0 or (end_idx - 4) < 0 or s.iloc[end_idx - 4] == 0
                    else float(s.iloc[end_idx] / s.iloc[end_idx - 4] - 1)
                ))(last_full_bar_index(s))
            ))()
        ),
        r1m_pct=pct(21),
        r3m_pct=pct(63),
        off_52w_high_pct=off_52w_high_pct,
    )


@router.get("/rsi", response_model=RsiDTO)
async def rsi(symbol: str = Query(..., min_length=1), provider=Depends(_provider)):
    ohlc = await provider.get_ohlc(symbol, period="6mo", interval="1d")
    s = _close_series_from_ohlc(ohlc)
    if s.empty:
        return RsiDTO(symbol=symbol.upper(), as_of=None, rsi=None, state=None)
    delta = s.diff()
    up = delta.clip(lower=0)
    down = -delta.clip(upper=0)
    roll_up = up.ewm(alpha=1 / 14, adjust=False).mean()
    roll_down = down.ewm(alpha=1 / 14, adjust=False).mean()
    rs = roll_up / roll_down.replace(0, np.nan)
    rsi_val = float(100 - (100 / (1 + rs.iloc[-1])))
    state = "Neutral"
    if rsi_val > 70:
        state = "Overbought"
    elif rsi_val < 30:
        state = "Oversold"
    return RsiDTO(
        symbol=symbol.upper(),
        as_of=s.index[-1].date().isoformat(),
        rsi=rsi_val,
        state=state,
    )


@router.get("/vix", response_model=VixDTO)
async def vix(provider=Depends(_provider)):
    ohlc = await provider.get_ohlc("^VIX", period="3mo", interval="1d")
    s = _close_series_from_ohlc(ohlc)
    if s.empty:
        return VixDTO(as_of=None, value=None, avg7=None)
    avg7 = float(s.rolling(7).mean().iloc[-1]) if len(s) >= 7 else None
    return VixDTO(
        as_of=s.index[-1].date().isoformat(), value=float(s.iloc[-1]), avg7=avg7
    )


@router.get("/returns", response_model=ReturnsDTO)
async def returns(
    symbol: str = Query(..., min_length=1),
    windows: str = Query("MTD,YTD"),
    provider=Depends(_provider),
):
    req_windows = [w.strip().upper() for w in windows.split(",") if w.strip()]
    ohlc = await provider.get_ohlc(symbol, period="2y", interval="1d")
    s = _close_series_from_ohlc(ohlc)
    out: Dict[str, Optional[float]] = {"MTD": None, "YTD": None}
    if s.empty:
        return ReturnsDTO(**{k: out.get(k) for k in ["MTD", "YTD"]})
    last_date = s.index[-1]
    last_close = float(s.iloc[-1])

    def pct_vs(ref: Optional[float]) -> Optional[float]:
        if ref is None or ref == 0 or pd.isna(ref):
            return None
        return float(last_close / ref - 1)

    if "MTD" in req_windows:
        prev_month_dt = last_date.replace(day=1) - pd.Timedelta(days=1)
        ref = s[
            (s.index.month == prev_month_dt.month)
            & (s.index.year == prev_month_dt.year)
        ]
        mtd_ref = float(ref.iloc[-1]) if len(ref) else None
        out["MTD"] = pct_vs(mtd_ref)

        if "YTD" in req_windows:
            # YTD: last close vs last trading day of prior calendar year
            prev_year = int(last_date.year) - 1
            ref = s[s.index.year == prev_year]
            if len(ref):
                ytd_ref: Optional[float] = float(ref.iloc[-1])
            else:
                cur_year = last_date.year
                start = s[s.index.year == cur_year]
                ytd_ref = float(start.iloc[0]) if len(start) else None
            out["YTD"] = pct_vs(ytd_ref)

    return ReturnsDTO(**{k: out.get(k) for k in ["MTD", "YTD"]})
