from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class TradeCreate(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20)
    direction: str = Field(..., min_length=1)
    status: str = Field(..., min_length=1)
    entry_price: float
    exit_price: Optional[float] = None
    position_size: float
    entry_time: datetime
    exit_time: Optional[datetime] = None
    stop_price: Optional[float] = None
    what_they_saw: Optional[str] = None
    exit_plan: Optional[str] = None
    feelings: Optional[str] = None
    notes: Optional[str] = None


class TradeUpdate(BaseModel):
    ticker: Optional[str] = Field(None, min_length=1, max_length=20)
    direction: Optional[str] = Field(None, min_length=1)
    status: Optional[str] = Field(None, min_length=1)
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    position_size: Optional[float] = None
    entry_time: Optional[datetime] = None
    exit_time: Optional[datetime] = None
    stop_price: Optional[float] = None
    what_they_saw: Optional[str] = None
    exit_plan: Optional[str] = None
    feelings: Optional[str] = None
    notes: Optional[str] = None


class TradeRead(BaseModel):
    id: UUID
    ticker: str
    direction: str
    status: str
    entry_price: float
    exit_price: Optional[float] = None
    position_size: float
    entry_time: datetime
    exit_time: Optional[datetime] = None
    stop_price: Optional[float] = None
    what_they_saw: Optional[str] = None
    exit_plan: Optional[str] = None
    feelings: Optional[str] = None
    notes: Optional[str] = None
    percent_pl: Optional[float] = None
    dollar_pl: Optional[float] = None
    hold_time_seconds: Optional[int] = None
    r_multiple: Optional[float] = None
    created_at: datetime
    updated_at: datetime


class TradeListFilters(BaseModel):
    ticker: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    limit: int = Field(50, ge=1, le=500)
    offset: int = Field(0, ge=0)


class TickerRead(BaseModel):
    symbol: str
    name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TickerUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None


class SetupCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    rules: List[str] = Field(default_factory=list)


class SetupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    rules: Optional[List[str]] = None
    ideal_screenshot_id: Optional[UUID] = None


class SetupRead(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    rules: List[str] = Field(default_factory=list)
    ideal_screenshot_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime


class SetupReviewCreate(BaseModel):
    ticker_symbol: str = Field(..., min_length=1, max_length=20)
    setup_id: Optional[UUID] = None
    trade_id: Optional[UUID] = None
    date: date
    notes: Optional[str] = None
    did_take_trade: bool = False


class SetupReviewUpdate(BaseModel):
    ticker_symbol: Optional[str] = Field(None, min_length=1, max_length=20)
    setup_id: Optional[UUID] = None
    trade_id: Optional[UUID] = None
    date: Optional[date] = None
    notes: Optional[str] = None
    did_take_trade: Optional[bool] = None


class SetupReviewRead(BaseModel):
    id: UUID
    ticker_symbol: str
    setup_id: Optional[UUID] = None
    trade_id: Optional[UUID] = None
    date: date
    notes: Optional[str] = None
    did_take_trade: bool
    created_at: datetime
    updated_at: datetime


class ScreenshotCreate(BaseModel):
    url: str = Field(..., min_length=1)
    caption: Optional[str] = None


class ScreenshotRead(BaseModel):
    id: UUID
    url: str
    caption: Optional[str] = None
    target_type: str
    target_id: str
    sort_order: int
    created_at: datetime


class SetupReviewListFilters(BaseModel):
    ticker_symbol: Optional[str] = None
    setup_id: Optional[UUID] = None
    did_take_trade: Optional[bool] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    limit: int = Field(50, ge=1, le=500)
    offset: int = Field(0, ge=0)


class TickerProfileFilters(BaseModel):
    setup_id: Optional[UUID] = None
    outcome: Literal["all", "winners", "losers"] = "all"


class TickerProfile(BaseModel):
    ticker: TickerRead
    trades: List[TradeRead] = Field(default_factory=list)
    setup_reviews: List[SetupReviewRead] = Field(default_factory=list)


class DailyNoteBase(BaseModel):
    date: date
    premarket_notes: Optional[str] = None
    eod_notes: Optional[str] = None


class DailyNoteCreateOrUpdate(DailyNoteBase):
    pass


class DailyNoteRead(DailyNoteBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class DailyNoteWithTrades(BaseModel):
    note: DailyNoteRead
    trades: List[TradeRead] = Field(default_factory=list)


class DailyNoteListFilters(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    limit: int = Field(50, ge=1, le=500)
    offset: int = Field(0, ge=0)


class DailyNoteTradesAttach(BaseModel):
    trade_ids: List[UUID] = Field(default_factory=list)
    role: Optional[str] = "taken"


class WeeklyNoteBase(BaseModel):
    week_start_date: date
    week_end_date: Optional[date] = None
    text: Optional[str] = None


class WeeklyNoteCreateOrUpdate(WeeklyNoteBase):
    pass


class WeeklyNoteRead(WeeklyNoteBase):
    id: UUID
    trade_count: int
    created_at: datetime
    updated_at: datetime


class WeeklyNoteWithTrades(BaseModel):
    note: WeeklyNoteRead
    trades: List[TradeRead] = Field(default_factory=list)


class WeeklyNoteListFilters(BaseModel):
    start_week: Optional[date] = None
    end_week: Optional[date] = None
    limit: int = Field(50, ge=1, le=500)
    offset: int = Field(0, ge=0)


class WeeklyNoteTradesAttach(BaseModel):
    trade_ids: List[UUID] = Field(default_factory=list)
    role: Optional[str] = "taken"


__all__ = [
    "TradeCreate",
    "TradeUpdate",
    "TradeRead",
    "TradeListFilters",
    "TickerRead",
    "TickerUpdate",
    "SetupCreate",
    "SetupUpdate",
    "SetupRead",
    "SetupReviewCreate",
    "SetupReviewUpdate",
    "SetupReviewRead",
    "ScreenshotCreate",
    "ScreenshotRead",
    "SetupReviewListFilters",
    "TickerProfileFilters",
    "TickerProfile",
    "DailyNoteCreateOrUpdate",
    "DailyNoteRead",
    "DailyNoteWithTrades",
    "DailyNoteListFilters",
    "DailyNoteTradesAttach",
    "WeeklyNoteCreateOrUpdate",
    "WeeklyNoteRead",
    "WeeklyNoteWithTrades",
    "WeeklyNoteListFilters",
    "WeeklyNoteTradesAttach",
]
