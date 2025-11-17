from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID

import duckdb  # type: ignore[import]


DATA_DIR = Path("data")
JOURNAL_DB = DATA_DIR / "journal.duckdb"


def ensure_schema() -> None:
    db_path = JOURNAL_DB
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = duckdb.connect(str(db_path))
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS trades (
                id UUID PRIMARY KEY,
                ticker TEXT,
                direction TEXT,
                status TEXT,
                entry_price DOUBLE,
                exit_price DOUBLE,
                position_size DOUBLE,
                entry_time TIMESTAMP,
                exit_time TIMESTAMP,
                stop_price DOUBLE,
                what_they_saw TEXT,
                exit_plan TEXT,
                feelings TEXT,
                notes TEXT,
                percent_pl DOUBLE,
                dollar_pl DOUBLE,
                hold_time_seconds BIGINT,
                r_multiple DOUBLE,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tickers (
                symbol TEXT PRIMARY KEY,
                name TEXT,
                notes TEXT,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS setups (
                id UUID PRIMARY KEY,
                name TEXT UNIQUE,
                description TEXT,
                rules JSON,
                ideal_screenshot_id UUID,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS setup_reviews (
                id UUID PRIMARY KEY,
                ticker_symbol TEXT,
                setup_id UUID,
                trade_id UUID,
                date DATE,
                notes TEXT,
                did_take_trade BOOLEAN,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS screenshots (
                id UUID PRIMARY KEY,
                url TEXT,
                caption TEXT,
                target_type TEXT,
                target_id TEXT,
                sort_order INT,
                created_at TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_notes (
                id UUID PRIMARY KEY,
                date DATE UNIQUE,
                premarket_notes TEXT,
                eod_notes TEXT,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS weekly_notes (
                id UUID PRIMARY KEY,
                week_start_date DATE UNIQUE,
                week_end_date DATE,
                text TEXT,
                trade_count INT,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_note_trades (
                daily_note_id UUID,
                trade_id UUID,
                role TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS weekly_note_trades (
                weekly_note_id UUID,
                trade_id UUID,
                role TEXT
            )
            """
        )
    finally:
        conn.close()


def get_connection() -> duckdb.DuckDBPyConnection:
    ensure_schema()
    return duckdb.connect(str(JOURNAL_DB))


def _row_to_dict(columns: List[str], row: Any) -> Dict[str, Any]:
    return {col: val for col, val in zip(columns, row)}


def insert_trade(record: Dict[str, Any]) -> Dict[str, Any]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        columns = [
            "id",
            "ticker",
            "direction",
            "status",
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
            "percent_pl",
            "dollar_pl",
            "hold_time_seconds",
            "r_multiple",
            "created_at",
            "updated_at",
        ]
        params = [record.get(col) for col in columns]
        conn.execute(
            f"""
            INSERT INTO trades ({', '.join(columns)})
            VALUES ({', '.join(['?'] * len(columns))})
            """,
            params,
        )
        trade_id = record["id"]
        row = conn.execute(
            """
            SELECT
                id,
                ticker,
                direction,
                status,
                entry_price,
                exit_price,
                position_size,
                entry_time,
                exit_time,
                stop_price,
                what_they_saw,
                exit_plan,
                feelings,
                notes,
                percent_pl,
                dollar_pl,
                hold_time_seconds,
                r_multiple,
                created_at,
                updated_at
            FROM trades
            WHERE id = ?
            """,
            [trade_id],
        ).fetchone()
        if row is None:
            raise RuntimeError("Failed to load trade after insert")
        colnames = [
            "id",
            "ticker",
            "direction",
            "status",
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
            "percent_pl",
            "dollar_pl",
            "hold_time_seconds",
            "r_multiple",
            "created_at",
            "updated_at",
        ]
        return _row_to_dict(colnames, row)
    finally:
        conn.close()


def get_trade(trade_id: UUID) -> Optional[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        row = conn.execute(
            """
            SELECT
                id,
                ticker,
                direction,
                status,
                entry_price,
                exit_price,
                position_size,
                entry_time,
                exit_time,
                stop_price,
                what_they_saw,
                exit_plan,
                feelings,
                notes,
                percent_pl,
                dollar_pl,
                hold_time_seconds,
                r_multiple,
                created_at,
                updated_at
            FROM trades
            WHERE id = ?
            """,
            [trade_id],
        ).fetchone()
        if row is None:
            return None
        colnames = [
            "id",
            "ticker",
            "direction",
            "status",
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
            "percent_pl",
            "dollar_pl",
            "hold_time_seconds",
            "r_multiple",
            "created_at",
            "updated_at",
        ]
        return _row_to_dict(colnames, row)
    finally:
        conn.close()


def update_trade(trade_id: UUID, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not updates:
        return get_trade(trade_id)

    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        set_clauses: List[str] = []
        params: List[Any] = []
        for key, value in updates.items():
            set_clauses.append(f"{key} = ?")
            params.append(value)
        params.append(trade_id)

        conn.execute(
            f"""
            UPDATE trades
            SET {', '.join(set_clauses)}
            WHERE id = ?
            """,
            params,
        )

        row = conn.execute(
            """
            SELECT
                id,
                ticker,
                direction,
                status,
                entry_price,
                exit_price,
                position_size,
                entry_time,
                exit_time,
                stop_price,
                what_they_saw,
                exit_plan,
                feelings,
                notes,
                percent_pl,
                dollar_pl,
                hold_time_seconds,
                r_multiple,
                created_at,
                updated_at
            FROM trades
            WHERE id = ?
            """,
            [trade_id],
        ).fetchone()
        if row is None:
            return None
        colnames = [
            "id",
            "ticker",
            "direction",
            "status",
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
            "percent_pl",
            "dollar_pl",
            "hold_time_seconds",
            "r_multiple",
            "created_at",
            "updated_at",
        ]
        return _row_to_dict(colnames, row)
    finally:
        conn.close()


def delete_trade(trade_id: UUID) -> bool:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        existing = conn.execute("SELECT id FROM trades WHERE id = ?", [trade_id]).fetchone()
        if existing is None:
            return False
        conn.execute("DELETE FROM trades WHERE id = ?", [trade_id])
        return True
    finally:
        conn.close()


def list_trades(
    *,
    ticker: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        clauses: List[str] = []
        params: List[Any] = []

        if ticker:
            clauses.append("ticker = ?")
            params.append(ticker.strip().upper())
        if status:
            clauses.append("status = ?")
            params.append(status.strip().lower())
        if start_date:
            clauses.append("entry_time >= ?")
            params.append(start_date)
        if end_date:
            clauses.append("entry_time <= ?")
            params.append(end_date)

        where_sql = ""
        if clauses:
            where_sql = "WHERE " + " AND ".join(clauses)

        params.extend([limit, offset])

        rows = conn.execute(
            f"""
            SELECT
                id,
                ticker,
                direction,
                status,
                entry_price,
                exit_price,
                position_size,
                entry_time,
                exit_time,
                stop_price,
                what_they_saw,
                exit_plan,
                feelings,
                notes,
                percent_pl,
                dollar_pl,
                hold_time_seconds,
                r_multiple,
                created_at,
                updated_at
            FROM trades
            {where_sql}
            ORDER BY entry_time DESC, created_at DESC
            LIMIT ? OFFSET ?
            """,
            params,
        ).fetchall()

        colnames = [
            "id",
            "ticker",
            "direction",
            "status",
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
            "percent_pl",
            "dollar_pl",
            "hold_time_seconds",
            "r_multiple",
            "created_at",
            "updated_at",
        ]
        return [_row_to_dict(colnames, row) for row in rows]
    finally:
        conn.close()


def upsert_ticker(symbol: str, name: Optional[str], notes: Optional[str]) -> Dict[str, Any]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    now = datetime.utcnow()
    try:
        existing = conn.execute(
            "SELECT symbol FROM tickers WHERE symbol = ?", [symbol]
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE tickers
                SET name = ?, notes = ?, updated_at = ?
                WHERE symbol = ?
                """,
                (name, notes, now, symbol),
            )
        else:
            conn.execute(
                """
                INSERT INTO tickers (symbol, name, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (symbol, name, notes, now, now),
            )
        row = conn.execute(
            """
            SELECT symbol, name, notes, created_at, updated_at
            FROM tickers
            WHERE symbol = ?
            """,
            [symbol],
        ).fetchone()
        if row is None:
            raise RuntimeError("Failed to load ticker after upsert")
        return _row_to_dict(
            ["symbol", "name", "notes", "created_at", "updated_at"],
            row,
        )
    finally:
        conn.close()


def get_ticker(symbol: str) -> Optional[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        row = conn.execute(
            """
            SELECT symbol, name, notes, created_at, updated_at
            FROM tickers
            WHERE symbol = ?
            """,
            [symbol],
        ).fetchone()
        if row is None:
            return None
        return _row_to_dict(
            ["symbol", "name", "notes", "created_at", "updated_at"],
            row,
        )
    finally:
        conn.close()


def list_tickers() -> List[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        rows = conn.execute(
            """
            SELECT symbol, name, notes, created_at, updated_at
            FROM tickers
            ORDER BY symbol
            """
        ).fetchall()
        return [
            _row_to_dict(["symbol", "name", "notes", "created_at", "updated_at"], row)
            for row in rows
        ]
    finally:
        conn.close()


def insert_setup(record: Dict[str, Any]) -> Dict[str, Any]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    columns = [
        "id",
        "name",
        "description",
        "rules",
        "ideal_screenshot_id",
        "created_at",
        "updated_at",
    ]
    try:
        conn.execute(
            f"""
            INSERT INTO setups ({', '.join(columns)})
            VALUES ({', '.join(['?'] * len(columns))})
            """,
            [record.get(col) for col in columns],
        )
        return get_setup(record["id"])  # type: ignore[return-value]
    finally:
        conn.close()


def get_setup(setup_id: UUID) -> Optional[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        row = conn.execute(
            """
            SELECT
                id,
                name,
                description,
                rules,
                ideal_screenshot_id,
                created_at,
                updated_at
            FROM setups
            WHERE id = ?
            """,
            [setup_id],
        ).fetchone()
        if row is None:
            return None
        return _row_to_dict(
            [
                "id",
                "name",
                "description",
                "rules",
                "ideal_screenshot_id",
                "created_at",
                "updated_at",
            ],
            row,
        )
    finally:
        conn.close()


def update_setup(setup_id: UUID, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not updates:
        return get_setup(setup_id)

    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        set_clauses: List[str] = []
        params: List[Any] = []
        for key, value in updates.items():
            set_clauses.append(f"{key} = ?")
            params.append(value)
        params.append(setup_id)
        conn.execute(
            f"""
            UPDATE setups
            SET {', '.join(set_clauses)}
            WHERE id = ?
            """,
            params,
        )
        return get_setup(setup_id)
    finally:
        conn.close()


def delete_setup(setup_id: UUID) -> bool:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        existing = conn.execute("SELECT id FROM setups WHERE id = ?", [setup_id]).fetchone()
        if existing is None:
            return False
        conn.execute("DELETE FROM setups WHERE id = ?", [setup_id])
        return True
    finally:
        conn.close()


def list_setups() -> List[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        rows = conn.execute(
            """
            SELECT
                id,
                name,
                description,
                rules,
                ideal_screenshot_id,
                created_at,
                updated_at
            FROM setups
            ORDER BY name
            """
        ).fetchall()
        return [
            _row_to_dict(
                [
                    "id",
                    "name",
                    "description",
                    "rules",
                    "ideal_screenshot_id",
                    "created_at",
                    "updated_at",
                ],
                row,
            )
            for row in rows
        ]
    finally:
        conn.close()


def insert_setup_review(record: Dict[str, Any]) -> Dict[str, Any]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    columns = [
        "id",
        "ticker_symbol",
        "setup_id",
        "trade_id",
        "date",
        "notes",
        "did_take_trade",
        "created_at",
        "updated_at",
    ]
    try:
        conn.execute(
            f"""
            INSERT INTO setup_reviews ({', '.join(columns)})
            VALUES ({', '.join(['?'] * len(columns))})
            """,
            [record.get(col) for col in columns],
        )
        return get_setup_review(record["id"])  # type: ignore[return-value]
    finally:
        conn.close()


def get_setup_review(review_id: UUID) -> Optional[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        row = conn.execute(
            """
            SELECT
                id,
                ticker_symbol,
                setup_id,
                trade_id,
                date,
                notes,
                did_take_trade,
                created_at,
                updated_at
            FROM setup_reviews
            WHERE id = ?
            """,
            [review_id],
        ).fetchone()
        if row is None:
            return None
        return _row_to_dict(
            [
                "id",
                "ticker_symbol",
                "setup_id",
                "trade_id",
                "date",
                "notes",
                "did_take_trade",
                "created_at",
                "updated_at",
            ],
            row,
        )
    finally:
        conn.close()


def update_setup_review(review_id: UUID, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not updates:
        return get_setup_review(review_id)

    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        set_clauses: List[str] = []
        params: List[Any] = []
        for key, value in updates.items():
            set_clauses.append(f"{key} = ?")
            params.append(value)
        params.append(review_id)
        conn.execute(
            f"""
            UPDATE setup_reviews
            SET {', '.join(set_clauses)}
            WHERE id = ?
            """,
            params,
        )
        return get_setup_review(review_id)
    finally:
        conn.close()


def delete_setup_review(review_id: UUID) -> bool:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        existing = conn.execute(
            "SELECT id FROM setup_reviews WHERE id = ?",
            [review_id],
        ).fetchone()
        if existing is None:
            return False
        conn.execute("DELETE FROM setup_reviews WHERE id = ?", [review_id])
        return True
    finally:
        conn.close()


def list_setup_reviews(
    *,
    ticker_symbol: Optional[str] = None,
    setup_id: Optional[UUID] = None,
    did_take_trade: Optional[bool] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        clauses: List[str] = []
        params: List[Any] = []
        if ticker_symbol:
            clauses.append("ticker_symbol = ?")
            params.append(ticker_symbol)
        if setup_id:
            clauses.append("setup_id = ?")
            params.append(setup_id)
        if did_take_trade is not None:
            clauses.append("did_take_trade = ?")
            params.append(did_take_trade)
        if start_date:
            clauses.append("date >= ?")
            params.append(start_date)
        if end_date:
            clauses.append("date <= ?")
            params.append(end_date)
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.extend([limit, offset])
        rows = conn.execute(
            f"""
            SELECT
                id,
                ticker_symbol,
                setup_id,
                trade_id,
                date,
                notes,
                did_take_trade,
                created_at,
                updated_at
            FROM setup_reviews
            {where_sql}
            ORDER BY date DESC, created_at DESC
            LIMIT ? OFFSET ?
            """,
            params,
        ).fetchall()
        return [
            _row_to_dict(
                [
                    "id",
                    "ticker_symbol",
                    "setup_id",
                    "trade_id",
                    "date",
                    "notes",
                    "did_take_trade",
                    "created_at",
                    "updated_at",
                ],
                row,
            )
            for row in rows
        ]
    finally:
        conn.close()


def insert_screenshot(record: Dict[str, Any]) -> Dict[str, Any]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    columns = [
        "id",
        "url",
        "caption",
        "target_type",
        "target_id",
        "sort_order",
        "created_at",
    ]
    try:
        conn.execute(
            f"""
            INSERT INTO screenshots ({', '.join(columns)})
            VALUES ({', '.join(['?'] * len(columns))})
            """,
            [record.get(col) for col in columns],
        )
        return get_screenshot(record["id"])  # type: ignore[return-value]
    finally:
        conn.close()


def get_screenshot(screenshot_id: UUID) -> Optional[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        row = conn.execute(
            """
            SELECT
                id,
                url,
                caption,
                target_type,
                target_id,
                sort_order,
                created_at
            FROM screenshots
            WHERE id = ?
            """,
            [screenshot_id],
        ).fetchone()
        if row is None:
            return None
        return _row_to_dict(
            [
                "id",
                "url",
                "caption",
                "target_type",
                "target_id",
                "sort_order",
                "created_at",
            ],
            row,
        )
    finally:
        conn.close()


def delete_screenshot(screenshot_id: UUID) -> bool:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        existing = conn.execute(
            "SELECT id FROM screenshots WHERE id = ?",
            [screenshot_id],
        ).fetchone()
        if existing is None:
            return False
        conn.execute("DELETE FROM screenshots WHERE id = ?", [screenshot_id])
        return True
    finally:
        conn.close()


def list_screenshots_for(target_type: str, target_id: str) -> List[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        rows = conn.execute(
            """
            SELECT
                id,
                url,
                caption,
                target_type,
                target_id,
                sort_order,
                created_at
            FROM screenshots
            WHERE target_type = ? AND target_id = ?
            ORDER BY sort_order ASC, created_at ASC
            """,
            (target_type, target_id),
        ).fetchall()
        return [
            _row_to_dict(
                [
                    "id",
                    "url",
                    "caption",
                    "target_type",
                    "target_id",
                    "sort_order",
                    "created_at",
                ],
                row,
            )
            for row in rows
        ]
    finally:
        conn.close()


def insert_daily_note(record: Dict[str, Any]) -> Dict[str, Any]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    columns = [
        "id",
        "date",
        "premarket_notes",
        "eod_notes",
        "created_at",
        "updated_at",
    ]
    try:
        conn.execute(
            f"""
            INSERT INTO daily_notes ({', '.join(columns)})
            VALUES ({', '.join(['?'] * len(columns))})
            """,
            [record.get(col) for col in columns],
        )
        return get_daily_note(record["id"])  # type: ignore[return-value]
    finally:
        conn.close()


def get_daily_note(note_id: UUID) -> Optional[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        row = conn.execute(
            """
            SELECT id, date, premarket_notes, eod_notes, created_at, updated_at
            FROM daily_notes
            WHERE id = ?
            """,
            [note_id],
        ).fetchone()
        if row is None:
            return None
        return _row_to_dict(
            ["id", "date", "premarket_notes", "eod_notes", "created_at", "updated_at"],
            row,
        )
    finally:
        conn.close()


def get_daily_note_by_date(note_date: date) -> Optional[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        row = conn.execute(
            """
            SELECT id, date, premarket_notes, eod_notes, created_at, updated_at
            FROM daily_notes
            WHERE date = ?
            """,
            [note_date],
        ).fetchone()
        if row is None:
            return None
        return _row_to_dict(
            ["id", "date", "premarket_notes", "eod_notes", "created_at", "updated_at"],
            row,
        )
    finally:
        conn.close()


def update_daily_note(note_id: UUID, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not updates:
        return get_daily_note(note_id)
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        set_clauses: List[str] = []
        params: List[Any] = []
        for key, value in updates.items():
            set_clauses.append(f"{key} = ?")
            params.append(value)
        params.append(note_id)
        conn.execute(
            f"""
            UPDATE daily_notes
            SET {', '.join(set_clauses)}
            WHERE id = ?
            """,
            params,
        )
        return get_daily_note(note_id)
    finally:
        conn.close()


def list_daily_notes(
    start_date: Optional[date],
    end_date: Optional[date],
    limit: int,
    offset: int,
) -> List[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        clauses: List[str] = []
        params: List[Any] = []
        if start_date:
            clauses.append("date >= ?")
            params.append(start_date)
        if end_date:
            clauses.append("date <= ?")
            params.append(end_date)
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.extend([limit, offset])
        rows = conn.execute(
            f"""
            SELECT id, date, premarket_notes, eod_notes, created_at, updated_at
            FROM daily_notes
            {where_sql}
            ORDER BY date DESC
            LIMIT ? OFFSET ?
            """,
            params,
        ).fetchall()
        return [
            _row_to_dict(
                ["id", "date", "premarket_notes", "eod_notes", "created_at", "updated_at"],
                row,
            )
            for row in rows
        ]
    finally:
        conn.close()


def insert_weekly_note(record: Dict[str, Any]) -> Dict[str, Any]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    columns = [
        "id",
        "week_start_date",
        "week_end_date",
        "text",
        "trade_count",
        "created_at",
        "updated_at",
    ]
    try:
        conn.execute(
            f"""
            INSERT INTO weekly_notes ({', '.join(columns)})
            VALUES ({', '.join(['?'] * len(columns))})
            """,
            [record.get(col) for col in columns],
        )
        return get_weekly_note(record["id"])  # type: ignore[return-value]
    finally:
        conn.close()


def get_weekly_note(note_id: UUID) -> Optional[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        row = conn.execute(
            """
            SELECT
                id,
                week_start_date,
                week_end_date,
                text,
                trade_count,
                created_at,
                updated_at
            FROM weekly_notes
            WHERE id = ?
            """,
            [note_id],
        ).fetchone()
        if row is None:
            return None
        return _row_to_dict(
            [
                "id",
                "week_start_date",
                "week_end_date",
                "text",
                "trade_count",
                "created_at",
                "updated_at",
            ],
            row,
        )
    finally:
        conn.close()


def get_weekly_note_by_start(week_start_date: date) -> Optional[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        row = conn.execute(
            """
            SELECT
                id,
                week_start_date,
                week_end_date,
                text,
                trade_count,
                created_at,
                updated_at
            FROM weekly_notes
            WHERE week_start_date = ?
            """,
            [week_start_date],
        ).fetchone()
        if row is None:
            return None
        return _row_to_dict(
            [
                "id",
                "week_start_date",
                "week_end_date",
                "text",
                "trade_count",
                "created_at",
                "updated_at",
            ],
            row,
        )
    finally:
        conn.close()


def update_weekly_note(note_id: UUID, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not updates:
        return get_weekly_note(note_id)
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        set_clauses: List[str] = []
        params: List[Any] = []
        for key, value in updates.items():
            set_clauses.append(f"{key} = ?")
            params.append(value)
        params.append(note_id)
        conn.execute(
            f"""
            UPDATE weekly_notes
            SET {', '.join(set_clauses)}
            WHERE id = ?
            """,
            params,
        )
        return get_weekly_note(note_id)
    finally:
        conn.close()


def list_weekly_notes(
    start_week: Optional[date],
    end_week: Optional[date],
    limit: int,
    offset: int,
) -> List[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        clauses: List[str] = []
        params: List[Any] = []
        if start_week:
            clauses.append("week_start_date >= ?")
            params.append(start_week)
        if end_week:
            clauses.append("week_start_date <= ?")
            params.append(end_week)
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.extend([limit, offset])
        rows = conn.execute(
            f"""
            SELECT
                id,
                week_start_date,
                week_end_date,
                text,
                trade_count,
                created_at,
                updated_at
            FROM weekly_notes
            {where_sql}
            ORDER BY week_start_date DESC
            LIMIT ? OFFSET ?
            """,
            params,
        ).fetchall()
        return [
            _row_to_dict(
                [
                    "id",
                    "week_start_date",
                    "week_end_date",
                    "text",
                    "trade_count",
                    "created_at",
                    "updated_at",
                ],
                row,
            )
            for row in rows
        ]
    finally:
        conn.close()


def add_daily_note_trades(note_id: UUID, trade_ids: List[UUID], role: str) -> None:
    if not trade_ids:
        return
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        for trade_id in trade_ids:
            conn.execute(
                """
                DELETE FROM daily_note_trades
                WHERE daily_note_id = ? AND trade_id = ?
                """,
                (note_id, trade_id),
            )
            conn.execute(
                """
                INSERT INTO daily_note_trades (daily_note_id, trade_id, role)
                VALUES (?, ?, ?)
                """,
                (note_id, trade_id, role),
            )
    finally:
        conn.close()


def remove_daily_note_trade(note_id: UUID, trade_id: UUID) -> None:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        conn.execute(
            "DELETE FROM daily_note_trades WHERE daily_note_id = ? AND trade_id = ?",
            (note_id, trade_id),
        )
    finally:
        conn.close()


def list_daily_note_trades(note_id: UUID) -> List[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        rows = conn.execute(
            """
            SELECT trade_id, role
            FROM daily_note_trades
            WHERE daily_note_id = ?
            ORDER BY trade_id
            """,
            [note_id],
        ).fetchall()
        return [_row_to_dict(["trade_id", "role"], row) for row in rows]
    finally:
        conn.close()


def add_weekly_note_trades(note_id: UUID, trade_ids: List[UUID], role: str) -> None:
    if not trade_ids:
        return
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        for trade_id in trade_ids:
            conn.execute(
                """
                DELETE FROM weekly_note_trades
                WHERE weekly_note_id = ? AND trade_id = ?
                """,
                (note_id, trade_id),
            )
            conn.execute(
                """
                INSERT INTO weekly_note_trades (weekly_note_id, trade_id, role)
                VALUES (?, ?, ?)
                """,
                (note_id, trade_id, role),
            )
    finally:
        conn.close()


def remove_weekly_note_trade(note_id: UUID, trade_id: UUID) -> None:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        conn.execute(
            "DELETE FROM weekly_note_trades WHERE weekly_note_id = ? AND trade_id = ?",
            (note_id, trade_id),
        )
    finally:
        conn.close()


def list_weekly_note_trades(note_id: UUID) -> List[Dict[str, Any]]:
    ensure_schema()
    conn = duckdb.connect(str(JOURNAL_DB))
    try:
        rows = conn.execute(
            """
            SELECT trade_id, role
            FROM weekly_note_trades
            WHERE weekly_note_id = ?
            ORDER BY trade_id
            """,
            [note_id],
        ).fetchall()
        return [_row_to_dict(["trade_id", "role"], row) for row in rows]
    finally:
        conn.close()


__all__ = [
    "DATA_DIR",
    "JOURNAL_DB",
    "ensure_schema",
    "get_connection",
    "insert_trade",
    "get_trade",
    "update_trade",
    "delete_trade",
    "list_trades",
    "upsert_ticker",
    "get_ticker",
    "list_tickers",
    "insert_setup",
    "get_setup",
    "update_setup",
    "delete_setup",
    "list_setups",
    "insert_setup_review",
    "get_setup_review",
    "update_setup_review",
    "delete_setup_review",
    "list_setup_reviews",
    "insert_screenshot",
    "get_screenshot",
    "delete_screenshot",
    "list_screenshots_for",
    "insert_daily_note",
    "get_daily_note",
    "get_daily_note_by_date",
    "update_daily_note",
    "list_daily_notes",
    "insert_weekly_note",
    "get_weekly_note",
    "get_weekly_note_by_start",
    "update_weekly_note",
    "list_weekly_notes",
    "add_daily_note_trades",
    "remove_daily_note_trade",
    "list_daily_note_trades",
    "add_weekly_note_trades",
    "remove_weekly_note_trade",
    "list_weekly_note_trades",
]
