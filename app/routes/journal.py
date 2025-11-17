from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.journal import (
    DailyNoteCreateOrUpdate,
    DailyNoteListFilters,
    DailyNoteRead,
    DailyNoteTradesAttach,
    DailyNoteWithTrades,
    ScreenshotCreate,
    ScreenshotRead,
    SetupCreate,
    SetupRead,
    SetupReviewCreate,
    SetupReviewListFilters,
    SetupReviewRead,
    SetupReviewUpdate,
    SetupUpdate,
    TickerProfile,
    TickerProfileFilters,
    TickerRead,
    TickerUpdate,
    TradeCreate,
    TradeListFilters,
    TradeRead,
    TradeUpdate,
    WeeklyNoteCreateOrUpdate,
    WeeklyNoteListFilters,
    WeeklyNoteRead,
    WeeklyNoteTradesAttach,
    WeeklyNoteWithTrades,
)
from app.services import journal as journal_service
from app.services.journal import JournalNotFoundError


router = APIRouter(prefix="/journal", tags=["journal"])


@router.get("/trades", response_model=List[TradeRead])
async def list_trades(filters: TradeListFilters = Depends()) -> List[TradeRead]:
    return journal_service.list_trades(filters)


@router.post(
    "/trades",
    response_model=TradeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_trade(payload: TradeCreate) -> TradeRead:
    try:
        return journal_service.create_trade(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/trades/{trade_id}", response_model=TradeRead)
async def get_trade(trade_id: UUID) -> TradeRead:
    try:
        return journal_service.get_trade(trade_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")


@router.patch("/trades/{trade_id}", response_model=TradeRead)
async def update_trade(trade_id: UUID, payload: TradeUpdate) -> TradeRead:
    try:
        return journal_service.update_trade(trade_id, payload)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete(
    "/trades/{trade_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_trade(trade_id: UUID) -> None:
    try:
        journal_service.delete_trade(trade_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")


@router.get("/trades/{trade_id}/screenshots", response_model=List[ScreenshotRead])
async def list_trade_screenshots(trade_id: UUID) -> List[ScreenshotRead]:
    try:
        return journal_service.list_trade_screenshots(trade_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")


@router.post(
    "/trades/{trade_id}/screenshots",
    response_model=ScreenshotRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_trade_screenshot(trade_id: UUID, payload: ScreenshotCreate) -> ScreenshotRead:
    try:
        return journal_service.add_trade_screenshot(trade_id, payload)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/tickers", response_model=List[TickerRead])
async def list_tickers() -> List[TickerRead]:
    return journal_service.list_tickers()


@router.get("/tickers/{symbol}", response_model=TickerProfile)
async def get_ticker_profile(symbol: str, filters: TickerProfileFilters = Depends()) -> TickerProfile:
    try:
        return journal_service.get_ticker_profile(symbol, filters)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/tickers/{symbol}", response_model=TickerRead)
async def update_ticker(symbol: str, payload: TickerUpdate) -> TickerRead:
    try:
        return journal_service.update_ticker(symbol, payload)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticker not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/setups", response_model=List[SetupRead])
async def list_setups() -> List[SetupRead]:
    return journal_service.list_setups()


@router.post("/setups", response_model=SetupRead, status_code=status.HTTP_201_CREATED)
async def create_setup(payload: SetupCreate) -> SetupRead:
    try:
        return journal_service.create_setup(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/setups/{setup_id}", response_model=SetupRead)
async def get_setup(setup_id: UUID) -> SetupRead:
    try:
        return journal_service.get_setup(setup_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup not found")


@router.patch("/setups/{setup_id}", response_model=SetupRead)
async def update_setup(setup_id: UUID, payload: SetupUpdate) -> SetupRead:
    try:
        return journal_service.update_setup(setup_id, payload)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete(
    "/setups/{setup_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_setup(setup_id: UUID) -> None:
    try:
        journal_service.delete_setup(setup_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup not found")


@router.get("/setup-reviews", response_model=List[SetupReviewRead])
async def list_setup_reviews(filters: SetupReviewListFilters = Depends()) -> List[SetupReviewRead]:
    try:
        return journal_service.list_setup_reviews(filters)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/setup-reviews", response_model=SetupReviewRead, status_code=status.HTTP_201_CREATED)
async def create_setup_review(payload: SetupReviewCreate) -> SetupReviewRead:
    try:
        return journal_service.create_setup_review(payload)
    except JournalNotFoundError as exc:
        detail = "Related record not found"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/setup-reviews/{review_id}", response_model=SetupReviewRead)
async def get_setup_review(review_id: UUID) -> SetupReviewRead:
    try:
        return journal_service.get_setup_review(review_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup review not found")


@router.patch("/setup-reviews/{review_id}", response_model=SetupReviewRead)
async def update_setup_review(review_id: UUID, payload: SetupReviewUpdate) -> SetupReviewRead:
    try:
        return journal_service.update_setup_review(review_id, payload)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup review not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete(
    "/setup-reviews/{review_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_setup_review(review_id: UUID) -> None:
    try:
        journal_service.delete_setup_review(review_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup review not found")


@router.get("/setup-reviews/{review_id}/screenshots", response_model=List[ScreenshotRead])
async def list_setup_review_screenshots(review_id: UUID) -> List[ScreenshotRead]:
    try:
        return journal_service.list_setup_review_screenshots(review_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup review not found")


@router.post(
    "/setup-reviews/{review_id}/screenshots",
    response_model=ScreenshotRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_setup_review_screenshot(
    review_id: UUID, payload: ScreenshotCreate
) -> ScreenshotRead:
    try:
        return journal_service.add_setup_review_screenshot(review_id, payload)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup review not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/daily-notes", response_model=List[DailyNoteRead])
async def list_daily_notes(filters: DailyNoteListFilters = Depends()) -> List[DailyNoteRead]:
    return journal_service.list_daily_notes(filters)


@router.post("/daily-notes", response_model=DailyNoteRead)
async def create_or_update_daily_note(payload: DailyNoteCreateOrUpdate) -> DailyNoteRead:
    try:
        return journal_service.create_or_update_daily_note(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/daily-notes/{note_id}", response_model=DailyNoteRead)
async def get_daily_note(note_id: UUID) -> DailyNoteRead:
    try:
        return journal_service.get_daily_note(note_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily note not found")


@router.get("/daily-notes/{note_id}/trades", response_model=DailyNoteWithTrades)
async def get_daily_note_with_trades(note_id: UUID) -> DailyNoteWithTrades:
    try:
        return journal_service.get_daily_note_with_trades(note_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily note not found")


@router.post(
    "/daily-notes/{note_id}/trades",
    response_model=DailyNoteWithTrades,
    status_code=status.HTTP_201_CREATED,
)
async def attach_trades_to_daily_note(
    note_id: UUID, payload: DailyNoteTradesAttach
) -> DailyNoteWithTrades:
    try:
        return journal_service.attach_trades_to_daily_note(
            note_id,
            payload.trade_ids,
            payload.role or "taken",
        )
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily note or trade not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete(
    "/daily-notes/{note_id}/trades/{trade_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def detach_trade_from_daily_note(note_id: UUID, trade_id: UUID) -> None:
    try:
        journal_service.detach_trade_from_daily_note(note_id, trade_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily note not found")


@router.get("/weekly-notes", response_model=List[WeeklyNoteRead])
async def list_weekly_notes(filters: WeeklyNoteListFilters = Depends()) -> List[WeeklyNoteRead]:
    return journal_service.list_weekly_notes(filters)


@router.post("/weekly-notes", response_model=WeeklyNoteRead)
async def create_or_update_weekly_note(payload: WeeklyNoteCreateOrUpdate) -> WeeklyNoteRead:
    try:
        return journal_service.create_or_update_weekly_note(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/weekly-notes/{note_id}", response_model=WeeklyNoteRead)
async def get_weekly_note(note_id: UUID) -> WeeklyNoteRead:
    try:
        return journal_service.get_weekly_note(note_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly note not found")


@router.get("/weekly-notes/{note_id}/trades", response_model=WeeklyNoteWithTrades)
async def get_weekly_note_with_trades(note_id: UUID) -> WeeklyNoteWithTrades:
    try:
        return journal_service.get_weekly_note_with_trades(note_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly note not found")


@router.post(
    "/weekly-notes/{note_id}/trades",
    response_model=WeeklyNoteWithTrades,
    status_code=status.HTTP_201_CREATED,
)
async def attach_trades_to_weekly_note(
    note_id: UUID, payload: WeeklyNoteTradesAttach
) -> WeeklyNoteWithTrades:
    try:
        return journal_service.attach_trades_to_weekly_note(
            note_id,
            payload.trade_ids,
            payload.role or "taken",
        )
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly note or trade not found")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete(
    "/weekly-notes/{note_id}/trades/{trade_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def detach_trade_from_weekly_note(note_id: UUID, trade_id: UUID) -> None:
    try:
        journal_service.detach_trade_from_weekly_note(note_id, trade_id)
    except JournalNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Weekly note not found")


__all__ = ["router"]
