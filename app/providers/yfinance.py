"""Minimal YFinance-backed data provider used by the dashboard."""
from __future__ import annotations

import asyncio
from typing import Dict, List, Optional, Union

import yfinance as yf  # type: ignore[import]

NumericRecord = Dict[str, Union[float, int]]


class YFinanceProvider:
    """Thin async wrapper around yfinance for the dashboard endpoints."""

    async def get_ohlc(
        self,
        symbol: str,
        period: str = "2y",
        interval: str = "1d",
        *,
        auto_adjust: bool = True,
    ) -> List[NumericRecord]:
        """Fetch historical OHLCV records.

        Accepts ``auto_adjust`` to align with callers that need either adjusted
        (default) or unadjusted prices. This fixes unexpected keyword errors
        from routes that pass ``auto_adjust=False`` (e.g., momentum endpoint).
        """
        df = await asyncio.to_thread(
            self._download_history,
            symbol,
            period=period,
            interval=interval,
            auto_adjust=auto_adjust,
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
            price = info.get("last_price") or info.get("regular_market_price")
            return float(price) if price is not None else None
        except Exception:
            return None

    async def get_vix_term(self) -> Optional[Dict[str, float]]:
        try:
            data = await self.get_ohlc("^VIX", period="1mo", interval="1d")
            if not data:
                return None
            last_close = float(data[-1]["Close"])
            count = min(len(data), 7)
            avg7 = sum(float(rec["Close"]) for rec in data[-count:]) / count
            return {"value": last_close, "avg7": avg7}
        except Exception:
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

    @staticmethod
    def _download_history(
        symbol: str, *, period: str, interval: str, auto_adjust: bool
    ):
        ticker = yf.Ticker(symbol)
        return ticker.history(period=period, interval=interval, auto_adjust=auto_adjust)
