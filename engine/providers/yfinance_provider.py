"""Async YFinance provider implementation with resilient fetch."""

from __future__ import annotations

import asyncio
import logging
import math
import os
import time
from typing import Any, Dict, List, Optional

import pandas as pd  # type: ignore[import]
import requests
import yfinance as yf



def _safe_float(value: Any, fallback: Optional[float] = None) -> Optional[float]:
    if value is None:
        return fallback
    try:
        result = float(value)
    except (TypeError, ValueError):
        return fallback
    if math.isnan(result) or math.isinf(result):
        return fallback
    return result


_ALLOWED_INTERVALS = {"1d", "1wk", "1mo"}
_ALLOW_SYNTHETIC = False

# Rate limiting to avoid Yahoo Finance blocking
_last_request_time = 0
_REQUEST_DELAY = 1.0  # 1 second between requests (increased from 0.5s)
_MAX_RETRIES = 3
_BASE_DELAY = 2.0  # Base delay for exponential backoff


def _rate_limit():
    """Ensure we don't make requests too quickly to avoid rate limiting."""
    global _last_request_time
    current_time = time.time()
    time_since_last = current_time - _last_request_time
    if time_since_last < _REQUEST_DELAY:
        time.sleep(_REQUEST_DELAY - time_since_last)
    _last_request_time = time.time()


def _is_rate_limited_error(error: Exception) -> bool:
    """Check if the error is due to rate limiting."""
    error_str = str(error).lower()
    return any(phrase in error_str for phrase in [
        "too many requests",
        "rate limit",
        "expecting value: line 1 column 1",
        "jsondecodeerror",
        "429"
    ])


def _retry_with_backoff(func, *args, **kwargs):
    """Retry a function with exponential backoff for rate limiting."""
    for attempt in range(_MAX_RETRIES):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if _is_rate_limited_error(e) and attempt < _MAX_RETRIES - 1:
                delay = _BASE_DELAY * (2 ** attempt)  # Exponential backoff
                logger = logging.getLogger("market_insights.yfinance")
                logger.warning("Rate limited, retrying in %.1fs (attempt %d/%d): %s", 
                             delay, attempt + 1, _MAX_RETRIES, e)
                time.sleep(delay)
                continue
            else:
                raise


class YFinanceProvider:
    """Provider supplying live data directly from Yahoo Finance."""

    @staticmethod
    def _history(symbol: str, period: str, interval: str):
        logger = logging.getLogger("market_insights.yfinance")
        
        # Apply rate limiting
        _rate_limit()
        
        # yfinance 0.2.66+ uses curl_cffi internally, no need for custom session
        def _try_history():
            ticker = yf.Ticker(symbol)  # Let yfinance handle session internally
            return ticker.history(
                period=period,
                interval=interval,
                auto_adjust=False,
                actions=False,
            )
        
        try:
            df = _retry_with_backoff(_try_history)
        except Exception as e:
            logger.warning("Ticker.history failed for %s after retries: %s", symbol, e)
            df = None

        if df is None or getattr(df, "empty", True):
            _rate_limit()  # Rate limit before fallback
            
            def _try_download():
                return yf.download(  # type: ignore[assignment]
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
                )
            
            try:
                df = _retry_with_backoff(_try_download)
            except Exception as e:
                logger.error("yf.download failed for %s after retries: %s", symbol, e)
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
        logger = logging.getLogger("market_insights.yfinance")
        interval_norm = (interval or "1d").lower()
        if interval_norm not in _ALLOWED_INTERVALS:
            logger.info(
                "Unsupported interval '%s' requested; using daily bars instead", interval
            )
            interval_norm = "1d"
        period_norm = period or "2y"

        df = await asyncio.to_thread(self._history, symbol, period_norm, interval_norm)
        if df is None or df.empty:
            logger.error(
                "yfinance returned no data for %s (period=%s interval=%s)",
                symbol,
                period_norm,
                interval_norm,
            )
            return []

        records: List[Dict[str, Any]] = []
        for idx, row in df.iterrows():
            dt = idx.to_pydatetime() if hasattr(idx, "to_pydatetime") else idx
            records.append(
                {
                    "Date": dt,
                    "Open": _safe_float(row.get("Open")),
                    "High": _safe_float(row.get("High")),
                    "Low": _safe_float(row.get("Low")),
                    "Close": _safe_float(row.get("Close")),
                    "Volume": _safe_float(row.get("Volume"), fallback=0.0),
                }
            )
        return records

    async def get_last_price(self, symbol: str) -> Optional[float]:
        info = await asyncio.to_thread(self._fast_info, symbol)
        price = (
            info.get("lastPrice")
            or info.get("last_price")
            or info.get("regular_market_price")
            or info.get("regularMarketPrice")
        )
        try:
            if price is not None:
                return float(price)
        except Exception:
            logger = logging.getLogger("market_insights.yfinance")
            logger.warning("Failed to fetch last price for %s via yfinance", symbol, exc_info=True)
        return None

    async def get_vix_term(self) -> Optional[Dict[str, float]]:
        async def fetch(symbol: str) -> Optional[float]:
            info = await asyncio.to_thread(self._fast_info, symbol)
            price = (
                info.get("lastPrice")
                or info.get("last_price")
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
