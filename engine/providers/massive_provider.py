"""Massive.com market data provider implemented via the official client SDK."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from massive import RESTClient

from engine.providers.base import MarketData

# Mapping used when computing VIX term structure.
_VIX_SYMBOLS = {
    "^VIX9D": "C:VIX9D",
    "^VIX": "C:VIX",
    "^VIX3M": "C:VIX3M",
}


def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


def _period_to_days(period: str) -> int:
    mapping = {
        "5d": 7,
        "1mo": 32,
        "3mo": 92,
        "6mo": 185,
        "1y": 370,
        "2y": 740,
        "5y": 1850,
        "10y": 3650,
        "max": 5000,
    }
    key = (period or "6mo").lower()
    if key in mapping:
        return mapping[key]
    try:
        if key.endswith("d"):
            return max(1, int(key[:-1]))
        if key.endswith("mo"):
            return max(1, int(key[:-2]) * 31)
        if key.endswith("y"):
            return max(1, int(key[:-1]) * 365)
    except (TypeError, ValueError):
        pass
    return 365


def _interval_to_span(interval: str) -> Tuple[int, str]:
    mapping = {
        "1d": (1, "day"),
        "1wk": (1, "week"),
        "1mo": (1, "month"),
    }
    return mapping.get((interval or "1d").lower(), (1, "day"))


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in {float("inf"), float("-inf")}:
        return None
    return number


def _normalize_timestamp(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    if isinstance(value, (int, float)):
        # Massive emits timestamps in nanoseconds for Polygon compatibility, but
        # can also return milliseconds. Distinguish by order of magnitude.
        if value > 1_000_000_000_000_000:  # nanoseconds
            value = value / 1_000_000_000
        elif value > 1_000_000_000_000:  # milliseconds
            value = value / 1_000
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if isinstance(value, str):
        try:
            if value.endswith("Z"):
                value = value[:-1] + "+00:00"
            return datetime.fromisoformat(value).astimezone(timezone.utc)
        except ValueError:
            return None
    return None


def _agg_to_dict(agg: Any) -> Dict[str, Any]:
    return {
        "timestamp": getattr(agg, "timestamp", getattr(agg, "t", None)),
        "open": getattr(agg, "open", getattr(agg, "o", None)),
        "high": getattr(agg, "high", getattr(agg, "h", None)),
        "low": getattr(agg, "low", getattr(agg, "l", None)),
        "close": getattr(agg, "close", getattr(agg, "c", None)),
        "volume": getattr(agg, "volume", getattr(agg, "v", None)),
    }


class MassiveMarketData(MarketData):
    """Adapter exposing Massive RESTClient through the MarketData interface."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://api.massive.com",
        timeout: float = 10.0,
        retries: int = 3,
    ) -> None:
        # The Massive client automatically uses the default host; explicit
        # base URL overrides are not currently exposed, so we keep the value in
        # diagnostics only.
        self._client = RESTClient(api_key=api_key)
        self._retries = max(0, int(retries))
        self._base_url = base_url
        self._success_count = 0
        self._failure_count = 0

    async def _run(self, func, *args, **kwargs):
        attempt = 0
        last_exc: Optional[Exception] = None
        while attempt <= self._retries:
            try:
                result = await asyncio.to_thread(func, *args, **kwargs)
                self._success_count += 1
                return result
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                self._failure_count += 1
                attempt += 1
                if attempt > self._retries:
                    raise
        if last_exc:
            raise last_exc
        raise RuntimeError("Massive client call failed without raising an exception")

    async def get_ohlc(
        self,
        symbol: str,
        *,
        period: str = "6mo",
        interval: str = "1d",
    ) -> List[Dict[str, Any]]:
        days = _period_to_days(period)
        start = (_now_utc() - timedelta(days=days)).strftime("%Y-%m-%d")
        end = _now_utc().strftime("%Y-%m-%d")
        multiplier, timespan = _interval_to_span(interval)

        def _fetch():
            return list(
                self._client.list_aggs(
                    ticker=symbol,
                    multiplier=multiplier,
                    timespan=timespan,
                    from_=start,
                    to=end,
                    adjusted=False,
                    sort="asc",
                    limit=50_000,
                )
            )

        items = await self._run(_fetch)
        bars: List[Dict[str, Any]] = []
        for item in items:
            payload = _agg_to_dict(item)
            timestamp = _normalize_timestamp(payload["timestamp"])
            if timestamp is None:
                continue
            open_px = _safe_float(payload["open"])
            high_px = _safe_float(payload["high"])
            low_px = _safe_float(payload["low"])
            close_px = _safe_float(payload["close"])
            volume = _safe_float(payload["volume"]) or 0.0
            bars.append(
                {
                    "date": timestamp.replace(tzinfo=None),
                    "open": open_px,
                    "high": high_px,
                    "low": low_px,
                    "close": close_px,
                    "volume": volume,
                    "dollar_volume": (close_px or 0.0) * volume,
                }
            )
        return bars

    async def get_last_price(self, symbol: str) -> Optional[float]:
        # For EOD usage we surface the previous close price.
        price = await self._get_previous_close(symbol)
        return price

    async def _get_previous_close(self, symbol: str) -> Optional[float]:
        def _fetch():
            return self._client.get_previous_close_agg(ticker=symbol, adjusted=False)

        result = await self._run(_fetch)
        price = None
        # Recent Massive client versions expose `.close` directly; fall back to
        # results list if present.
        if hasattr(result, "close"):
            price = getattr(result, "close")
        else:
            results = getattr(result, "results", None)
            if isinstance(results, list) and results:
                price = getattr(results[0], "close", getattr(results[0], "c", None))
        return _safe_float(price)

    async def get_vix_term(self) -> Optional[Dict[str, float]]:
        values: Dict[str, float] = {}
        for app_symbol, massive_symbol in _VIX_SYMBOLS.items():
            price = await self._get_previous_close(massive_symbol)
            if price is None:
                return None
            values[app_symbol] = price
        return values

    async def aclose(self) -> None:
        close = getattr(self._client, "close", None)
        if callable(close):
            await asyncio.to_thread(close)

    def diagnostics(self) -> Dict[str, Any]:
        total = self._success_count + self._failure_count
        rate = (self._failure_count / total) if total else None
        return {
            "name": "massive",
            "base_url": self._base_url,
            "request_quota": None,
            "recent_request_ids": [],
            "error_rate": {
                "success": self._success_count,
                "failure": self._failure_count,
                "rate": rate,
            },
        }


__all__ = ["MassiveMarketData"]
