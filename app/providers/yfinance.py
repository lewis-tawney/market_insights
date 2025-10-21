"""Minimal YFinance-backed data provider used by the dashboard.

This implementation adds a resilient download path:
- Use a shared `requests.Session` with a browser-like User-Agent to avoid
  occasional Yahoo blocking.
- Call `Ticker.history(..., raise_errors=True)`; on failure or empty result,
  fall back to `yf.download(...)` with compatible options.
"""
from __future__ import annotations

import asyncio
from typing import Dict, List, Optional, Union

import yfinance as yf  # type: ignore[import]
import logging
import requests
import pandas as pd  # type: ignore[import]

NumericRecord = Dict[str, Union[float, int]]


class YFinanceProvider:
    """Thin async wrapper around yfinance for the dashboard endpoints."""

    async def get_ohlc(
        self, symbol: str, period: str = "2y", interval: str = "1d"
    ) -> List[NumericRecord]:
        df = await asyncio.to_thread(
            self._download_history, symbol, period=period, interval=interval
        )
        if df is None or df.empty:
            return []
        records: List[NumericRecord] = []
        for ts, row in df.iterrows():
            dt = (
                ts.to_pydatetime().replace(tzinfo=None)
                if hasattr(ts, "to_pydatetime")
                else ts
            )
            records.append(
                {
                    "Date": dt,
                    "Open": float(row.get("Open", 0.0)),
                    "High": float(row.get("High", 0.0)),
                    "Low": float(row.get("Low", 0.0)),
                    "Close": float(row.get("Close", 0.0)),
                    "Volume": int(row.get("Volume", 0)),
                }
            )
        return records

    async def get_last_price(self, symbol: str) -> Optional[float]:
        try:
            ticker = yf.Ticker(symbol)
            info = await asyncio.to_thread(lambda: ticker.fast_info)
            price = (
                info.get("last_price")
                or info.get("regular_market_price")
                or info.get("regularMarketPrice")
            )
            return float(price) if price is not None else None
        except Exception:
            return None

    async def get_vix_term(self) -> Optional[Dict[str, float]]:
        """Return VIX term structure using fast_info for 9D, spot and 3M.

        Expected mapping keys for callers: "^VIX9D", "^VIX", "^VIX3M".
        Returns None if any leg cannot be fetched.
        """
        symbols = ["^VIX9D", "^VIX", "^VIX3M"]

        def _fast_price(sym: str) -> Optional[float]:
            try:
                t = yf.Ticker(sym)
                info = t.fast_info or {}
                price = (
                    info.get("last_price")
                    or info.get("regular_market_price")
                    or info.get("regularMarketPrice")
                )
                return float(price) if price is not None else None
            except Exception:
                return None

        values = await asyncio.gather(
            *(asyncio.to_thread(_fast_price, s) for s in symbols)
        )
        mapping = {sym: v for sym, v in zip(symbols, values) if v is not None}
        if len(mapping) != len(symbols):
            return None
        return mapping

    def get_available_symbols(self, limit: Optional[int] = None) -> List[str]:
        symbols = [
            "SPY",
            "QQQ",
            "IWM",
            "AAPL",
            "MSFT",
            "GOOGL",
            "AMZN",
            "TSLA",
            "META",
            "NVDA",
            "NFLX",
            "^VIX",
        ]
        return symbols[:limit] if limit else symbols

    @staticmethod
    def _download_history(symbol: str, period: str, interval: str):
        logger = logging.getLogger("market_insights.yfinance")

        # Reuse a session with a decent User-Agent to reduce 403s
        sess = requests.Session()
        sess.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/119.0.0.0 Safari/537.36"
                )
            }
        )

        # First attempt: Ticker.history with raised errors so we can see issues
        try:
            ticker = yf.Ticker(symbol, session=sess)
            df = ticker.history(
                period=period,
                interval=interval,
                auto_adjust=False,
                actions=False,
                raise_errors=True,  # type: ignore[arg-type]
            )
        except Exception as e:
            logger.warning("Ticker.history failed for %s: %s", symbol, e)
            df = None

        # Fallback 1: yf.download which sometimes succeeds when history() fails
        if df is None or getattr(df, "empty", True):
            try:
                df = yf.download(  # type: ignore[assignment]
                    tickers=symbol,
                    period=period,
                    interval=interval,
                    auto_adjust=False,
                    actions=False,
                    threads=False,
                    progress=False,
                    group_by="column",
                    prepost=False,
                    repair=True,
                    session=sess,
                    # yfinance >=0.2.4x supports raise_errors
                    raise_errors=True,  # type: ignore[call-arg]
                )
            except Exception as e:
                logger.error("yf.download failed for %s: %s", symbol, e)
                df = None

        # Fallback 2: explicit start date window to avoid period glitches
        if df is None or getattr(df, "empty", True):
            import datetime as _dt

            def _days_for(p: str) -> int:
                mapping = {
                    "5d": 7,
                    "1mo": 45,
                    "3mo": 120,
                    "6mo": 220,
                    "1y": 380,
                    "2y": 760,
                    "5y": 2000,
                    "10y": 4000,
                    "max": 10000,
                }
                return mapping.get(p, 380)

            start = (_dt.datetime.utcnow() - _dt.timedelta(days=_days_for(period))).date()
            try:
                df = yf.download(  # type: ignore[assignment]
                    tickers=symbol,
                    start=str(start),
                    interval=interval,
                    auto_adjust=False,
                    actions=False,
                    threads=False,
                    progress=False,
                    group_by="column",
                    prepost=False,
                    repair=True,
                    session=sess,
                    raise_errors=True,  # type: ignore[call-arg]
                )
            except Exception as e:
                logger.error("yf.download(start=…) failed for %s: %s", symbol, e)
                return None

        # Normalize potential MultiIndex columns
        if hasattr(df, "columns") and isinstance(df.columns, pd.MultiIndex):
            try:
                df = df.droplevel(0, axis=1)
            except Exception:
                pass
        return df
