"""Application-layer Massive market data provider."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from engine.providers.massive_provider import MassiveMarketData

NumericRecord = Dict[str, Any]


def _to_app_record(bar: Dict[str, Any]) -> NumericRecord:
    """Convert a normalised Massive bar into the shape expected by app callers."""
    return {
        "Date": bar.get("date"),
        "Open": bar.get("open"),
        "High": bar.get("high"),
        "Low": bar.get("low"),
        "Close": bar.get("close"),
        "Volume": bar.get("volume"),
        "DollarVolume": bar.get("dollar_volume"),
    }


class MassiveProvider:
    """Provider used by the FastAPI layer to access Massive data."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = "https://api.massive.com",
        timeout: float = 10.0,
        retries: int = 3,
    ) -> None:
        self._market = MassiveMarketData(
            api_key,
            base_url=base_url,
            timeout=timeout,
            retries=retries,
        )

    async def get_ohlc(
        self,
        symbol: str,
        *,
        period: str = "6mo",
        interval: str = "1d",
    ) -> List[NumericRecord]:
        bars = await self._market.get_ohlc(symbol, period=period, interval=interval)
        return [_to_app_record(bar) for bar in bars]

    async def get_last_price(self, symbol: str) -> Optional[float]:
        return await self._market.get_last_price(symbol)

    async def get_vix_term(self) -> Optional[Dict[str, float]]:
        return await self._market.get_vix_term()

    def get_available_symbols(self, limit: Optional[int] = None) -> List[str]:
        # Massive exposes a searchable symbols endpoint; we will integrate it later.
        return []

    async def aclose(self) -> None:
        await self._market.aclose()

    async def __aenter__(self) -> "MassiveProvider":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()

    def diagnostics(self) -> Dict[str, Any]:
        """Return diagnostic metadata for debugging endpoints."""
        return self._market.diagnostics()


__all__ = [
    "MassiveProvider",
]
