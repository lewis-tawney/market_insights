from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class SectorIn(BaseModel):
    id: str
    name: str
    tickers: List[str]


class TickerLeaderDTO(BaseModel):
    ticker: str
    relVol10: Optional[float] = None
    change1d: Optional[float] = None


class SectorVolumeDTO(BaseModel):
    id: str
    name: str
    members: List[str]
    relVol10_median: Optional[float] = None
    dollarVol_today_sum: Optional[float] = None
    avgDollarVol10_sum: Optional[float] = None
    change1d_median: Optional[float] = None
    leaders: List[TickerLeaderDTO] = Field(default_factory=list)
    spark10: List[float] = Field(default_factory=list)
    lastUpdated: Optional[str] = None


class SectorVolumeRequest(BaseModel):
    sectors: List[SectorIn]
