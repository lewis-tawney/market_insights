from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

import pandas as pd  # type: ignore
import yfinance as yf  # type: ignore


def last_full_bar_index(s: pd.Series) -> int:
    if s.empty:
        return -1
    idx = len(s) - 1
    now_et = datetime.now(ZoneInfo("America/New_York"))
    last_ts = s.index[-1]
    last_dt = last_ts.to_pydatetime() if hasattr(last_ts, "to_pydatetime") else last_ts
    if getattr(last_dt, "date", None) and last_dt.date() == now_et.date():
        if now_et.time() < time(16, 5):
            idx -= 1
    return idx


def main(symbol: str = "XLRE") -> None:
    # Use unadjusted OHLC to match most quote sources for 52W High
    df = yf.Ticker(symbol).history(period="12mo", interval="1d", auto_adjust=False)
    if df is None or df.empty:
        raise SystemExit(f"No data for {symbol}")

    s = df["Close"].astype(float).dropna().sort_index()
    end = last_full_bar_index(s)
    if end < 0:
        raise SystemExit("Series empty after filtering")
    as_of = s.index[end].date().isoformat()

    # Limit highs to last full session and then to 252 trading days
    hs = df["High"].astype(float).dropna().sort_index()
    hs_upto = hs.loc[:s.index[end]]
    window_slice_close = s.loc[:s.index[end]].tail(252)
    window_slice_high = hs_upto.tail(252)
    hi_52w_close = float(window_slice_high.max())
    hi_52w_date = window_slice_high.idxmax().date().isoformat()
    last_close = float(s.iloc[end])
    pct_off_52w = last_close / hi_52w_close - 1
    range_52w = (window_slice_close.index[0].date().isoformat(), as_of)

    # Last 5 completed sessions inclusive of end -> base is t-4
    start = end - 4
    if start >= 0:
        base = float(s.iloc[start])
        r5d_pct = last_close / base - 1
        five_day_range = (s.index[start].date().isoformat(), as_of)
    else:
        r5d_pct = None
        five_day_range = None

    print("symbol =", symbol)
    print("as_of =", as_of)
    print("current_close =", last_close)
    print("close_52w_high =", hi_52w_close)
    print("close_52w_high_date =", hi_52w_date)
    print("range_52w =", range_52w)
    print("pct_off_52w =", pct_off_52w)
    print("five_day_range =", five_day_range)
    print("r5d_pct =", r5d_pct)


if __name__ == "__main__":
    main()
