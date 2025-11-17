from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from app.schemas.journal import (
    DailyNoteCreateOrUpdate,
    DailyNoteListFilters,
    DailyNoteRead,
    DailyNoteWithTrades,
    WeeklyNoteCreateOrUpdate,
    WeeklyNoteListFilters,
    WeeklyNoteRead,
    WeeklyNoteWithTrades,
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
)
from app.services import journal_db


class JournalNotFoundError(KeyError):
    pass


def _normalize_symbol(symbol: str) -> str:
    sym = symbol.strip().upper()
    if not sym:
        raise ValueError("symbol is required")
    return sym


def _serialize_rules(rules: Optional[List[str]]) -> str:
    if not rules:
        return json.dumps([])
    cleaned = [str(rule).strip() for rule in rules if str(rule).strip()]
    return json.dumps(cleaned)


def _deserialize_rules(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(rule) for rule in raw]
    try:
        data = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if isinstance(data, list):
        return [str(rule) for rule in data]
    return []


def _build_setup(row: Dict[str, Any]) -> SetupRead:
    payload = dict(row)
    payload["rules"] = _deserialize_rules(payload.get("rules"))
    return SetupRead(**payload)


def _build_setup_review(row: Dict[str, Any]) -> SetupReviewRead:
    return SetupReviewRead(**row)


def _build_screenshot(row: Dict[str, Any]) -> ScreenshotRead:
    return ScreenshotRead(**row)


def _build_daily_note(row: Dict[str, Any]) -> DailyNoteRead:
    return DailyNoteRead(**row)


def _build_weekly_note(row: Dict[str, Any]) -> WeeklyNoteRead:
    return WeeklyNoteRead(**row)


def _normalize_date_value(value: date | datetime) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value


def _load_trade(trade_id: UUID) -> TradeRead:
    trade_row = journal_db.get_trade(trade_id)
    if trade_row is None:
        raise JournalNotFoundError(str(trade_id))
    return TradeRead(**trade_row)


def _sync_weekly_trade_count(note_id: UUID) -> None:
    links = journal_db.list_weekly_note_trades(note_id)
    journal_db.update_weekly_note(
        note_id,
        {
            "trade_count": len(links),
            "updated_at": datetime.utcnow(),
        },
    )


def _normalize_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def compute_trade_metrics(
    entry_price: float,
    exit_price: float | None,
    position_size: float,
    stop_price: float | None,
    entry_time: datetime,
    exit_time: datetime | None,
) -> tuple[float | None, float | None, int | None, float | None]:
    percent_pl: float | None = None
    dollar_pl: float | None = None
    hold_time_seconds: int | None = None
    r_multiple: float | None = None

    try:
        ep = float(entry_price)
        size = float(position_size)
    except (TypeError, ValueError):
        return None, None, None, None

    if exit_price is not None:
        try:
            ex = float(exit_price)
        except (TypeError, ValueError):
            ex = None
        if ex is not None and ep > 0 and size != 0:
            price_diff = ex - ep
            percent_pl = (price_diff / ep) * 100.0
            dollar_pl = price_diff * size

    if entry_time and exit_time:
        try:
            def _to_utc(value: datetime) -> datetime:
                if value.tzinfo is None:
                    return value.replace(tzinfo=timezone.utc)
                return value.astimezone(timezone.utc)

            delta = _to_utc(exit_time) - _to_utc(entry_time)
            seconds = int(delta.total_seconds())
            hold_time_seconds = max(seconds, 0)
        except Exception:
            hold_time_seconds = None

    if stop_price is not None and dollar_pl is not None:
        try:
            sp = float(stop_price)
            risk_per_share = abs(ep - sp)
            notional_risk = risk_per_share * abs(size)
            if notional_risk > 0:
                r_multiple = dollar_pl / notional_risk
        except (TypeError, ValueError):
            r_multiple = None

    return percent_pl, dollar_pl, hold_time_seconds, r_multiple


def _normalize_direction(direction: str) -> str:
    d = direction.strip().lower()
    if d not in {"long", "short"}:
        raise ValueError("direction must be 'long' or 'short'")
    return d


def _normalize_status(status: str) -> str:
    s = status.strip().lower()
    if s not in {"open", "closed"}:
        raise ValueError("status must be 'open' or 'closed'")
    return s


def create_trade(dto: TradeCreate) -> TradeRead:
    journal_db.ensure_schema()
    trade_id = uuid4()
    now = datetime.utcnow()

    ticker = dto.ticker.strip().upper()
    if not ticker:
        raise ValueError("ticker is required")

    direction = _normalize_direction(dto.direction)
    status = _normalize_status(dto.status)

    percent_pl, dollar_pl, hold_time_seconds, r_multiple = compute_trade_metrics(
        entry_price=dto.entry_price,
        exit_price=dto.exit_price,
        position_size=dto.position_size if direction == "long" else -dto.position_size,
        stop_price=dto.stop_price,
        entry_time=dto.entry_time,
        exit_time=dto.exit_time,
    )

    record = {
        "id": trade_id,
        "ticker": ticker,
        "direction": direction,
        "status": status,
        "entry_price": dto.entry_price,
        "exit_price": dto.exit_price,
        "position_size": dto.position_size,
        "entry_time": _normalize_timestamp(dto.entry_time),
        "exit_time": _normalize_timestamp(dto.exit_time),
        "stop_price": dto.stop_price,
        "what_they_saw": dto.what_they_saw,
        "exit_plan": dto.exit_plan,
        "feelings": dto.feelings,
        "notes": dto.notes,
        "percent_pl": percent_pl,
        "dollar_pl": dollar_pl,
        "hold_time_seconds": hold_time_seconds,
        "r_multiple": r_multiple,
        "created_at": now,
        "updated_at": now,
    }

    row = journal_db.insert_trade(record)
    return TradeRead(**row)


def get_trade(trade_id: UUID) -> TradeRead:
    journal_db.ensure_schema()
    row = journal_db.get_trade(trade_id)
    if row is None:
        raise JournalNotFoundError(str(trade_id))
    return TradeRead(**row)


def update_trade(trade_id: UUID, dto: TradeUpdate) -> TradeRead:
    journal_db.ensure_schema()
    existing = journal_db.get_trade(trade_id)
    if existing is None:
        raise JournalNotFoundError(str(trade_id))

    updated = dict(existing)

    if dto.ticker is not None:
        ticker = dto.ticker.strip().upper()
        if not ticker:
            raise ValueError("ticker is required")
        updated["ticker"] = ticker

    if dto.direction is not None:
        updated["direction"] = _normalize_direction(dto.direction)

    if dto.status is not None:
        updated["status"] = _normalize_status(dto.status)

    for field in (
        "entry_price",
        "exit_price",
        "position_size",
        "entry_time",
        "exit_time",
        "stop_price",
        "what_they_saw",
        "exit_plan",
        "feelings",
        "notes",
    ):
        value = getattr(dto, field)
        if value is not None:
            if field in {"entry_time", "exit_time"}:
                updated[field] = _normalize_timestamp(value)
            else:
                updated[field] = value

    direction = updated.get("direction") or "long"
    entry_price = updated.get("entry_price")
    exit_price = updated.get("exit_price")
    position_size = updated.get("position_size")
    entry_time = updated.get("entry_time")
    exit_time = updated.get("exit_time")
    stop_price = updated.get("stop_price")

    if entry_price is None or position_size is None or entry_time is None:
        percent_pl = None
        dollar_pl = None
        hold_time_seconds = None
        r_multiple = None
    else:
        percent_pl, dollar_pl, hold_time_seconds, r_multiple = compute_trade_metrics(
            entry_price=entry_price,
            exit_price=exit_price,
            position_size=position_size if direction == "long" else -position_size,
            stop_price=stop_price,
            entry_time=entry_time,
            exit_time=exit_time,
        )

    updated["percent_pl"] = percent_pl
    updated["dollar_pl"] = dollar_pl
    updated["hold_time_seconds"] = hold_time_seconds
    updated["r_multiple"] = r_multiple
    updated["updated_at"] = datetime.utcnow()

    # Remove immutable fields from the update payload
    mutable_updates = {
        key: value
        for key, value in updated.items()
        if key
        not in {
            "id",
            "created_at",
        }
    }

    row = journal_db.update_trade(trade_id, mutable_updates)
    if row is None:
        raise JournalNotFoundError(str(trade_id))
    return TradeRead(**row)


def delete_trade(trade_id: UUID) -> None:
    journal_db.ensure_schema()
    deleted = journal_db.delete_trade(trade_id)
    if not deleted:
        raise JournalNotFoundError(str(trade_id))


def list_trades(filters: TradeListFilters) -> List[TradeRead]:
    journal_db.ensure_schema()
    ticker = filters.ticker.strip().upper() if filters.ticker else None
    status = filters.status.strip().lower() if filters.status else None

    rows = journal_db.list_trades(
        ticker=ticker,
        status=status,
        start_date=filters.start_date,
        end_date=filters.end_date,
        limit=filters.limit,
        offset=filters.offset,
    )
    return [TradeRead(**row) for row in rows]


def get_or_create_ticker(symbol: str) -> TickerRead:
    normalized = _normalize_symbol(symbol)
    row = journal_db.get_ticker(normalized)
    if row is None:
        row = journal_db.upsert_ticker(normalized, None, None)
    return TickerRead(**row)


def update_ticker(symbol: str, dto: TickerUpdate) -> TickerRead:
    normalized = _normalize_symbol(symbol)
    existing = journal_db.get_ticker(normalized)
    if existing is None:
        raise JournalNotFoundError(normalized)

    payload = dto.model_dump(exclude_unset=True)
    name = payload.get("name", existing.get("name"))
    notes = payload.get("notes", existing.get("notes"))
    row = journal_db.upsert_ticker(normalized, name, notes)
    return TickerRead(**row)


def list_tickers() -> List[TickerRead]:
    rows = journal_db.list_tickers()
    return [TickerRead(**row) for row in rows]


def create_setup(dto: SetupCreate) -> SetupRead:
    name = dto.name.strip()
    if not name:
        raise ValueError("name is required")
    setup_id = uuid4()
    now = datetime.utcnow()
    record = {
        "id": setup_id,
        "name": name,
        "description": dto.description,
        "rules": _serialize_rules(dto.rules),
        "ideal_screenshot_id": None,
        "created_at": now,
        "updated_at": now,
    }
    row = journal_db.insert_setup(record)
    if row is None:
        raise RuntimeError("Failed to create setup")
    return _build_setup(row)


def get_setup(setup_id: UUID) -> SetupRead:
    row = journal_db.get_setup(setup_id)
    if row is None:
        raise JournalNotFoundError(str(setup_id))
    return _build_setup(row)


def update_setup(setup_id: UUID, dto: SetupUpdate) -> SetupRead:
    existing = journal_db.get_setup(setup_id)
    if existing is None:
        raise JournalNotFoundError(str(setup_id))

    updates: Dict[str, Any] = {}
    payload = dto.model_dump(exclude_unset=True)
    if "name" in payload:
        name = (payload["name"] or "").strip()
        if not name:
            raise ValueError("name is required")
        updates["name"] = name
    if "description" in payload:
        updates["description"] = payload["description"]
    if "rules" in payload:
        updates["rules"] = _serialize_rules(payload.get("rules"))
    if "ideal_screenshot_id" in payload:
        updates["ideal_screenshot_id"] = payload.get("ideal_screenshot_id")
    if updates:
        updates["updated_at"] = datetime.utcnow()
    row = journal_db.update_setup(setup_id, updates)
    if row is None:
        raise JournalNotFoundError(str(setup_id))
    return _build_setup(row)


def delete_setup(setup_id: UUID) -> None:
    deleted = journal_db.delete_setup(setup_id)
    if not deleted:
        raise JournalNotFoundError(str(setup_id))


def list_setups() -> List[SetupRead]:
    rows = journal_db.list_setups()
    return [_build_setup(row) for row in rows]


def create_setup_review(dto: SetupReviewCreate) -> SetupReviewRead:
    ticker_symbol = _normalize_symbol(dto.ticker_symbol)
    if dto.setup_id:
        if journal_db.get_setup(dto.setup_id) is None:
            raise JournalNotFoundError(str(dto.setup_id))
    if dto.trade_id:
        if journal_db.get_trade(dto.trade_id) is None:
            raise JournalNotFoundError(str(dto.trade_id))

    review_id = uuid4()
    now = datetime.utcnow()
    record = {
        "id": review_id,
        "ticker_symbol": ticker_symbol,
        "setup_id": dto.setup_id,
        "trade_id": dto.trade_id,
        "date": dto.date,
        "notes": dto.notes,
        "did_take_trade": dto.did_take_trade,
        "created_at": now,
        "updated_at": now,
    }
    row = journal_db.insert_setup_review(record)
    if row is None:
        raise RuntimeError("Failed to create setup review")
    return _build_setup_review(row)


def get_setup_review(review_id: UUID) -> SetupReviewRead:
    row = journal_db.get_setup_review(review_id)
    if row is None:
        raise JournalNotFoundError(str(review_id))
    return _build_setup_review(row)


def update_setup_review(review_id: UUID, dto: SetupReviewUpdate) -> SetupReviewRead:
    existing = journal_db.get_setup_review(review_id)
    if existing is None:
        raise JournalNotFoundError(str(review_id))

    updates: Dict[str, Any] = {}
    payload = dto.model_dump(exclude_unset=True)
    if "ticker_symbol" in payload:
        updates["ticker_symbol"] = _normalize_symbol(payload["ticker_symbol"])
    if "setup_id" in payload:
        setup_id = payload.get("setup_id")
        if setup_id and journal_db.get_setup(setup_id) is None:
            raise JournalNotFoundError(str(setup_id))
        updates["setup_id"] = setup_id
    if "trade_id" in payload:
        trade_id = payload.get("trade_id")
        if trade_id and journal_db.get_trade(trade_id) is None:
            raise JournalNotFoundError(str(trade_id))
        updates["trade_id"] = trade_id
    if "date" in payload:
        updates["date"] = payload["date"]
    if "notes" in payload:
        updates["notes"] = payload["notes"]
    if "did_take_trade" in payload:
        updates["did_take_trade"] = payload["did_take_trade"]
    if updates:
        updates["updated_at"] = datetime.utcnow()
    row = journal_db.update_setup_review(review_id, updates)
    if row is None:
        raise JournalNotFoundError(str(review_id))
    return _build_setup_review(row)


def delete_setup_review(review_id: UUID) -> None:
    deleted = journal_db.delete_setup_review(review_id)
    if not deleted:
        raise JournalNotFoundError(str(review_id))


def list_setup_reviews(filters: SetupReviewListFilters) -> List[SetupReviewRead]:
    ticker_symbol = _normalize_symbol(filters.ticker_symbol) if filters.ticker_symbol else None
    rows = journal_db.list_setup_reviews(
        ticker_symbol=ticker_symbol,
        setup_id=filters.setup_id,
        did_take_trade=filters.did_take_trade,
        start_date=filters.start_date,
        end_date=filters.end_date,
        limit=filters.limit,
        offset=filters.offset,
    )
    return [_build_setup_review(row) for row in rows]


def _create_screenshot(target_type: str, target_id: str, dto: ScreenshotCreate) -> ScreenshotRead:
    existing = journal_db.list_screenshots_for(target_type, target_id)
    sort_order = len(existing)
    screenshot_id = uuid4()
    record = {
        "id": screenshot_id,
        "url": dto.url,
        "caption": dto.caption,
        "target_type": target_type,
        "target_id": target_id,
        "sort_order": sort_order,
        "created_at": datetime.utcnow(),
    }
    row = journal_db.insert_screenshot(record)
    if row is None:
        raise RuntimeError("Failed to create screenshot")
    return _build_screenshot(row)


def add_trade_screenshot(trade_id: UUID, dto: ScreenshotCreate) -> ScreenshotRead:
    if journal_db.get_trade(trade_id) is None:
        raise JournalNotFoundError(str(trade_id))
    return _create_screenshot("trade", str(trade_id), dto)


def list_trade_screenshots(trade_id: UUID) -> List[ScreenshotRead]:
    if journal_db.get_trade(trade_id) is None:
        raise JournalNotFoundError(str(trade_id))
    rows = journal_db.list_screenshots_for("trade", str(trade_id))
    return [_build_screenshot(row) for row in rows]


def add_setup_review_screenshot(review_id: UUID, dto: ScreenshotCreate) -> ScreenshotRead:
    if journal_db.get_setup_review(review_id) is None:
        raise JournalNotFoundError(str(review_id))
    return _create_screenshot("setup_review", str(review_id), dto)


def list_setup_review_screenshots(review_id: UUID) -> List[ScreenshotRead]:
    if journal_db.get_setup_review(review_id) is None:
        raise JournalNotFoundError(str(review_id))
    rows = journal_db.list_screenshots_for("setup_review", str(review_id))
    return [_build_screenshot(row) for row in rows]


def get_ticker_profile(symbol: str, filters: TickerProfileFilters) -> TickerProfile:
    ticker = get_or_create_ticker(symbol)
    trade_filters = TradeListFilters(
        ticker=ticker.symbol,
        limit=500,
        offset=0,
    )
    trades = list_trades(trade_filters)
    if filters.outcome == "winners":
        trades = [trade for trade in trades if (trade.dollar_pl or 0) > 0]
    elif filters.outcome == "losers":
        trades = [trade for trade in trades if (trade.dollar_pl or 0) < 0]

    review_filters = SetupReviewListFilters(
        ticker_symbol=ticker.symbol,
        setup_id=filters.setup_id,
        did_take_trade=None,
        start_date=None,
        end_date=None,
        limit=500,
        offset=0,
    )
    setup_reviews = list_setup_reviews(review_filters)
    return TickerProfile(ticker=ticker, trades=trades, setup_reviews=setup_reviews)


def create_or_update_daily_note(dto: DailyNoteCreateOrUpdate) -> DailyNoteRead:
    note_date = _normalize_date_value(dto.date)
    existing = journal_db.get_daily_note_by_date(note_date)
    now = datetime.utcnow()
    payload = {
        "date": note_date,
        "premarket_notes": dto.premarket_notes,
        "eod_notes": dto.eod_notes,
        "updated_at": now,
    }
    if existing:
        row = journal_db.update_daily_note(existing["id"], payload)
    else:
        payload["id"] = uuid4()
        payload["created_at"] = now
        row = journal_db.insert_daily_note(payload)
    if row is None:
        raise RuntimeError("Failed to persist daily note")
    return _build_daily_note(row)


def get_daily_note(note_id: UUID) -> DailyNoteRead:
    row = journal_db.get_daily_note(note_id)
    if row is None:
        raise JournalNotFoundError(str(note_id))
    return _build_daily_note(row)


def get_daily_note_by_date(note_date: date) -> DailyNoteRead:
    normalized = _normalize_date_value(note_date)
    row = journal_db.get_daily_note_by_date(normalized)
    if row is None:
        raise JournalNotFoundError(str(normalized))
    return _build_daily_note(row)


def list_daily_notes(filters: DailyNoteListFilters) -> List[DailyNoteRead]:
    rows = journal_db.list_daily_notes(
        start_date=filters.start_date,
        end_date=filters.end_date,
        limit=filters.limit,
        offset=filters.offset,
    )
    return [_build_daily_note(row) for row in rows]


def get_daily_note_with_trades(note_id: UUID) -> DailyNoteWithTrades:
    note = get_daily_note(note_id)
    links = journal_db.list_daily_note_trades(note_id)
    trades: List[TradeRead] = []
    for link in links:
        link_trade_id = link.get("trade_id")
        if not link_trade_id:
            continue
        try:
            trade_uuid = link_trade_id if isinstance(link_trade_id, UUID) else UUID(str(link_trade_id))
        except (ValueError, TypeError):
            continue
        try:
            trades.append(_load_trade(trade_uuid))
        except JournalNotFoundError:
            continue
    return DailyNoteWithTrades(note=note, trades=trades)


def attach_trades_to_daily_note(
    note_id: UUID, trade_ids: List[UUID], role: str = "taken"
) -> DailyNoteWithTrades:
    get_daily_note(note_id)
    normalized_role = role.strip().lower() if role else "taken"
    normalized_role = normalized_role or "taken"
    for trade_id in trade_ids:
        _load_trade(trade_id)
    journal_db.add_daily_note_trades(note_id, trade_ids, normalized_role)
    return get_daily_note_with_trades(note_id)


def detach_trade_from_daily_note(note_id: UUID, trade_id: UUID) -> None:
    get_daily_note(note_id)
    journal_db.remove_daily_note_trade(note_id, trade_id)


def create_or_update_weekly_note(dto: WeeklyNoteCreateOrUpdate) -> WeeklyNoteRead:
    week_start = _normalize_date_value(dto.week_start_date)
    existing = journal_db.get_weekly_note_by_start(week_start)
    now = datetime.utcnow()
    payload = {
        "week_start_date": week_start,
        "week_end_date": dto.week_end_date,
        "text": dto.text,
        "updated_at": now,
    }
    if existing:
        row = journal_db.update_weekly_note(existing["id"], payload)
    else:
        payload["id"] = uuid4()
        payload["trade_count"] = 0
        payload["created_at"] = now
        row = journal_db.insert_weekly_note(payload)
    if row is None:
        raise RuntimeError("Failed to persist weekly note")
    return _build_weekly_note(row)


def get_weekly_note(note_id: UUID) -> WeeklyNoteRead:
    row = journal_db.get_weekly_note(note_id)
    if row is None:
        raise JournalNotFoundError(str(note_id))
    return _build_weekly_note(row)


def get_weekly_note_by_start(week_start_date: date) -> WeeklyNoteRead:
    normalized = _normalize_date_value(week_start_date)
    row = journal_db.get_weekly_note_by_start(normalized)
    if row is None:
        raise JournalNotFoundError(str(normalized))
    return _build_weekly_note(row)


def list_weekly_notes(filters: WeeklyNoteListFilters) -> List[WeeklyNoteRead]:
    rows = journal_db.list_weekly_notes(
        start_week=filters.start_week,
        end_week=filters.end_week,
        limit=filters.limit,
        offset=filters.offset,
    )
    return [_build_weekly_note(row) for row in rows]


def get_weekly_note_with_trades(note_id: UUID) -> WeeklyNoteWithTrades:
    note = get_weekly_note(note_id)
    links = journal_db.list_weekly_note_trades(note_id)
    trades: List[TradeRead] = []
    for link in links:
        link_trade_id = link.get("trade_id")
        if not link_trade_id:
            continue
        try:
            trade_uuid = link_trade_id if isinstance(link_trade_id, UUID) else UUID(str(link_trade_id))
        except (ValueError, TypeError):
            continue
        try:
            trades.append(_load_trade(trade_uuid))
        except JournalNotFoundError:
            continue
    return WeeklyNoteWithTrades(note=note, trades=trades)


def attach_trades_to_weekly_note(
    note_id: UUID, trade_ids: List[UUID], role: str = "taken"
) -> WeeklyNoteWithTrades:
    get_weekly_note(note_id)
    normalized_role = role.strip().lower() if role else "taken"
    normalized_role = normalized_role or "taken"
    for trade_id in trade_ids:
        _load_trade(trade_id)
    journal_db.add_weekly_note_trades(note_id, trade_ids, normalized_role)
    _sync_weekly_trade_count(note_id)
    return get_weekly_note_with_trades(note_id)


def detach_trade_from_weekly_note(note_id: UUID, trade_id: UUID) -> None:
    get_weekly_note(note_id)
    journal_db.remove_weekly_note_trade(note_id, trade_id)
    _sync_weekly_trade_count(note_id)


__all__ = [
    "JournalNotFoundError",
    "compute_trade_metrics",
    "create_trade",
    "update_trade",
    "get_trade",
    "delete_trade",
    "list_trades",
    "get_or_create_ticker",
    "update_ticker",
    "list_tickers",
    "create_setup",
    "get_setup",
    "update_setup",
    "delete_setup",
    "list_setups",
    "create_setup_review",
    "get_setup_review",
    "update_setup_review",
    "delete_setup_review",
    "list_setup_reviews",
    "add_trade_screenshot",
    "list_trade_screenshots",
    "add_setup_review_screenshot",
    "list_setup_review_screenshots",
    "get_ticker_profile",
    "create_or_update_daily_note",
    "get_daily_note",
    "get_daily_note_by_date",
    "list_daily_notes",
    "get_daily_note_with_trades",
    "attach_trades_to_daily_note",
    "detach_trade_from_daily_note",
    "create_or_update_weekly_note",
    "get_weekly_note",
    "get_weekly_note_by_start",
    "list_weekly_notes",
    "get_weekly_note_with_trades",
    "attach_trades_to_weekly_note",
    "detach_trade_from_weekly_note",
]
