"""Async YFinance provider implementation with resilient fetch."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

import logging
import requests
import pandas as pd  # type: ignore[import]
import yfinance as yf


class YFinanceProvider:
    """Provider supplying live data directly from Yahoo Finance."""

    @staticmethod
    def _history(symbol: str, period: str, interval: str):
        logger = logging.getLogger("market_insights.yfinance")
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
                    raise_errors=True,  # type: ignore[call-arg]
                )
            except Exception as e:
                logger.error("yf.download failed for %s: %s", symbol, e)
                df = None

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

        if hasattr(df, "columns") and isinstance(df.columns, pd.MultiIndex):
            try:
                df = df.droplevel(0, axis=1)
            except Exception:
                pass
        return df

    @staticmethod
    def _fast_info(symbol: str) -> Dict[str, Any]:
        ticker = yf.Ticker(symbol)
        try:
            return dict(ticker.fast_info or {})
        except Exception:
            return {}

    async def get_ohlc(
        self, symbol: str, *, period: str = "2y", interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        df = await asyncio.to_thread(self._history, symbol, period, interval)
        if df is None or df.empty:
            return []

        records: List[Dict[str, Any]] = []
        for idx, row in df.iterrows():
            dt = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else idx
            records.append(
                {
                    "Date": dt,
                    "Open": float(row.get("Open", 0.0)),
                    "High": float(row.get("High", 0.0)),
                    "Low": float(row.get("Low", 0.0)),
                    "Close": float(row.get("Close", 0.0)),
                    "Volume": float(row.get("Volume", 0.0)),
                }
            )
        return records

    async def get_last_price(self, symbol: str) -> Optional[float]:
        info = await asyncio.to_thread(self._fast_info, symbol)
        price = (
            info.get("last_price")
            or info.get("regular_market_price")
            or info.get("regularMarketPrice")
        )
        try:
            return float(price) if price is not None else None
        except Exception:
            return None

    async def get_vix_term(self) -> Optional[Dict[str, float]]:
        async def fetch(symbol: str) -> Optional[float]:
            info = await asyncio.to_thread(self._fast_info, symbol)
            price = (
                info.get("last_price")
                or info.get("regular_market_price")
                or info.get("regularMarketPrice")
            )
            try:
                return float(price) if price is not None else None
            except Exception:
                return None

        symbols = ["^VIX9D", "^VIX", "^VIX3M"]
        values = await asyncio.gather(*(fetch(sym) for sym in symbols))
        mapping = {sym: val for sym, val in zip(symbols, values) if val is not None}
        if len(mapping) == len(symbols):
            return mapping
        return None

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
