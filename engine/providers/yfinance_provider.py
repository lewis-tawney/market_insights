"""Async YFinance provider implementation."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

import yfinance as yf


class YFinanceProvider:
    """Provider supplying live data directly from Yahoo Finance."""

    @staticmethod
    def _history(symbol: str, period: str, interval: str):
        ticker = yf.Ticker(symbol)
        return ticker.history(period=period, interval=interval)

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
