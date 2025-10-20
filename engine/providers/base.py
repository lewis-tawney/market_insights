# engine/providers/base.py
from __future__ import annotations

from typing import Any, Dict, List, Optional, Protocol


class MarketData(Protocol):
    async def get_last_price(self, symbol: str) -> Optional[float]:
        ...

    async def get_ohlc(
        self,
        symbol: str,
        *,
        period: str = "6mo",
        interval: str = "1d",
        auto_adjust: bool = False,
    ) -> List[Dict[str, Any]]:
        ...

    async def get_vix_term(self) -> Optional[Dict[str, float]]:
        ...
