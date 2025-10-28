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


class DailyMetricDTO(BaseModel):
    date: str
    close: Optional[float] = None
    volume: Optional[float] = None
    dollarVolume: Optional[float] = None


class TickerMetricDTO(BaseModel):
    ticker: str
    change1d: Optional[float] = None
    relVol10: Optional[float] = None
    dollarVolToday: Optional[float] = None
    avgDollarVol10: Optional[float] = None
    lastUpdated: Optional[str] = None
    inactive: bool = False
    history: List[DailyMetricDTO] = Field(default_factory=list)


class SectorVolumeDTO(BaseModel):
    id: str
    name: str
    members: List[str]
    relVol10_median: Optional[float] = None
    dollarVol_today_sum: Optional[float] = None
    avgDollarVol10_sum: Optional[float] = None
    change1d_median: Optional[float] = None
    leaders: List[TickerLeaderDTO] = Field(default_factory=list)
    lastUpdated: Optional[str] = None
    members_detail: List[TickerMetricDTO] = Field(default_factory=list)


class SectorVolumeRequest(BaseModel):
    sectors: List[SectorIn]


__all__ = [
    "SectorIn",
    "TickerLeaderDTO",
    "DailyMetricDTO",
    "TickerMetricDTO",
    "SectorVolumeDTO",
    "SectorVolumeRequest",
]
