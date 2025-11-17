from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Optional

import logging

import duckdb  # type: ignore[import]

from app.providers import get_provider
from app.services import sector_snapshot
from app.schemas.sector_volume import SectorIn
from app.services.massive_flatfiles import (
    backfill_symbols_into_duckdb,
    create_massive_client,
)
from server.jobs import eod_snapshot

JobCallable = Callable[[], Awaitable[Optional[str]]]

QUEUE_CHECK_INTERVAL = 0.05
MASSIVE_BACKFILL_YEARS = 5
MASSIVE_CACHE_DIR = Path("var/massive_cache")
LOGGER = logging.getLogger("jobs.massive")


@dataclass
class JobRecord:
    id: str
    kind: str
    status: str
    message: Optional[str] = None
    started: Optional[datetime] = None
    ended: Optional[datetime] = None
    meta: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "message": self.message,
            "started": self.started.isoformat() if self.started else None,
            "ended": self.ended.isoformat() if self.ended else None,
            "meta": self.meta,
        }


@dataclass
class JobWork:
    record: JobRecord
    coro_factory: JobCallable


class JobManager:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._queue: "asyncio.Queue[JobWork]" = asyncio.Queue()
        self._tasks: Dict[str, JobRecord] = {}
        self._lock = asyncio.Lock()
        self._worker_task: Optional[asyncio.Task] = None
        self._started = False

    async def start(self) -> None:
        if self._started:
            return
        self._ensure_tables()
        self._worker_task = asyncio.create_task(self._worker())
        self._started = True

    async def stop(self) -> None:
        if not self._started:
            return
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        self._worker_task = None
        self._started = False

    async def enqueue(self, kind: str, coro_factory: JobCallable, *, meta: Optional[Dict[str, Any]] = None) -> str:
        job_id = str(uuid.uuid4())
        record = JobRecord(id=job_id, kind=kind, status="queued", meta=meta or {})
        async with self._lock:
            self._tasks[job_id] = record
        await asyncio.to_thread(self._persist_record, record)
        await self._queue.put(JobWork(record=record, coro_factory=coro_factory))
        return job_id

    async def enqueue_sector_patch(self, sector_id: str) -> str:
        sector_key = sector_id.strip().lower()

        async def job() -> Optional[str]:
            lock = sector_snapshot.get_sector_lock(sector_key)
            async with lock:
                row = await asyncio.to_thread(_recompute_sector_sync, sector_key)
                await sector_snapshot.patch_latest_snapshot(row)
            return f"patched {sector_key}"

        return await self.enqueue(
            "sector_patch",
            job,
            meta={"sector_id": sector_key},
        )

    async def enqueue_add_ticker(self, sector_id: str, symbol: str) -> str:
        sector_key = sector_id.strip().lower()
        ticker = symbol.strip().upper()
        if not ticker:
            raise ValueError("Ticker symbol required")

        await asyncio.to_thread(self._upsert_sector_member, sector_key, ticker)

        async def job() -> Optional[str]:
            lock = sector_snapshot.get_sector_lock(sector_key)
            async with lock:
                await self._ensure_symbol_data(ticker)
                row = await asyncio.to_thread(_recompute_sector_sync, sector_key)
                await sector_snapshot.patch_latest_snapshot(row)
            return f"added {ticker}"

        return await self.enqueue(
            "sector_add_ticker",
            job,
            meta={"sector_id": sector_key, "symbol": ticker},
        )

    async def enqueue_remove_ticker(self, sector_id: str, symbol: str) -> str:
        sector_key = sector_id.strip().lower()
        ticker = symbol.strip().upper()
        await asyncio.to_thread(self._delete_sector_member, sector_key, ticker)

        async def job() -> Optional[str]:
            lock = sector_snapshot.get_sector_lock(sector_key)
            async with lock:
                row = await asyncio.to_thread(_recompute_sector_sync, sector_key)
                await sector_snapshot.patch_latest_snapshot(row)
            return f"removed {ticker}"

        return await self.enqueue(
            "sector_remove_ticker",
            job,
            meta={"sector_id": sector_key, "symbol": ticker},
        )

    async def enqueue_create_sector(self, sector: SectorIn) -> str:
        async def job() -> Optional[str]:
            lock = sector_snapshot.get_sector_lock(sector.id)
            async with lock:
                await asyncio.to_thread(self._persist_sector_definition, sector)
                for ticker in sector.tickers:
                    await self._ensure_symbol_data(ticker)
                row = await asyncio.to_thread(_recompute_sector_sync, sector.id)
                await sector_snapshot.patch_latest_snapshot(row)
            return f"created {sector.id}"

        return await self.enqueue(
            "sector_create",
            job,
            meta={"sector_id": sector.id},
        )

    async def get(self, task_id: str) -> Optional[JobRecord]:
        async with self._lock:
            record = self._tasks.get(task_id)
        if record:
            return record
        return await asyncio.to_thread(self._load_record, task_id)

    async def wait(self, task_id: str, timeout: Optional[float] = 10.0) -> JobRecord:
        loop = asyncio.get_running_loop()
        start = loop.time()
        while True:
            record = await self.get(task_id)
            if record and record.status in {"succeeded", "failed"}:
                return record
            if timeout is not None and loop.time() - start > timeout:
                raise TimeoutError(f"Task {task_id} did not finish within timeout")
            await asyncio.sleep(QUEUE_CHECK_INTERVAL)

    def _connect(self) -> duckdb.DuckDBPyConnection:
        return duckdb.connect(str(self._db_path))

    def _backfill_symbol_history(self, symbol: str) -> int:
        cache_dir = MASSIVE_CACHE_DIR
        cache_dir.mkdir(parents=True, exist_ok=True)
        start_date = date.today() - timedelta(days=365 * MASSIVE_BACKFILL_YEARS)
        end_date = date.today()
        conn = self._connect()
        try:
            eod_snapshot.ensure_tables(conn)
            client = create_massive_client()
            inserted = backfill_symbols_into_duckdb(
                [symbol],
                start_date,
                end_date,
                conn,
                cache_dir,
                client=client,
            )
            conn.commit()
            return inserted
        finally:
            conn.close()

    def _persist_sector_definition(self, sector: SectorIn) -> None:
        conn = self._connect()
        try:
            max_order = conn.execute(
                "SELECT MAX(sort_order) FROM sector_definitions"
            ).fetchone()
            next_order = (int(max_order[0]) if max_order and max_order[0] is not None else -1) + 1
            conn.execute(
                """
                INSERT OR REPLACE INTO sector_definitions (sector_id, name, sort_order)
                VALUES (?, ?, ?)
                """,
                (sector.id, sector.name, next_order),
            )
            for ticker in sector.tickers:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO sectors_map (sector_id, symbol)
                    VALUES (?, ?)
                    """,
                    (sector.id, ticker.strip().upper()),
                )
            try:
                sector_snapshot.export_sectors_to_json(Path("config/sectors_snapshot_current.json"))
            except Exception:
                LOGGER.warning("Failed to export sectors snapshot to JSON", exc_info=True)
        finally:
            conn.close()

    def _ensure_tables(self) -> None:
        conn = self._connect()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS job_runs (
                    id TEXT PRIMARY KEY,
                    kind TEXT,
                    status TEXT,
                    started TIMESTAMP,
                    ended TIMESTAMP,
                    message TEXT,
                    meta JSON
                )
                """
            )
        finally:
            conn.close()

    def _persist_record(self, record: JobRecord) -> None:
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT OR REPLACE INTO job_runs (id, kind, status, started, ended, message, meta)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id,
                    record.kind,
                    record.status,
                    record.started,
                    record.ended,
                    record.message,
                    json.dumps(record.meta or {}),
                ),
            )
        finally:
            conn.close()

    def _load_record(self, task_id: str) -> Optional[JobRecord]:
        conn = self._connect()
        try:
            row = conn.execute(
                """
                SELECT id, kind, status, started, ended, message, meta
                FROM job_runs
                WHERE id = ?
                """,
                (task_id,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return None
        meta_raw = row[6]
        meta: Dict[str, Any]
        if isinstance(meta_raw, str) and meta_raw:
            try:
                meta = json.loads(meta_raw)
            except json.JSONDecodeError:
                meta = {}
        elif isinstance(meta_raw, dict):
            meta = meta_raw
        else:
            meta = {}
        return JobRecord(
            id=row[0],
            kind=row[1],
            status=row[2],
            started=row[3],
            ended=row[4],
            message=row[5],
            meta=meta,
        )

    async def _worker(self) -> None:
        try:
            while True:
                work = await self._queue.get()
                record = work.record
                started_at = datetime.now(timezone.utc)
                await self._update_record(record.id, status="running", started=started_at)
                message: Optional[str] = None
                try:
                    message = await work.coro_factory()
                    ended_at = datetime.now(timezone.utc)
                    await self._update_record(
                        record.id,
                        status="succeeded",
                        ended=ended_at,
                        message=message,
                    )
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # pragma: no cover - defensive
                    ended_at = datetime.now(timezone.utc)
                    await self._update_record(
                        record.id,
                        status="failed",
                        ended=ended_at,
                        message=str(exc),
                    )
                finally:
                    self._queue.task_done()
        except asyncio.CancelledError:
            pass

    async def _update_record(
        self,
        task_id: str,
        *,
        status: Optional[str] = None,
        message: Optional[str] = None,
        started: Optional[datetime] = None,
        ended: Optional[datetime] = None,
    ) -> None:
        async with self._lock:
            record = self._tasks.get(task_id)
            if record is None:
                record = await asyncio.to_thread(self._load_record, task_id)
                if record is None:
                    return
                self._tasks[task_id] = record
            if status is not None:
                record.status = status
            if message is not None:
                record.message = message
            if started is not None:
                record.started = started
            if ended is not None:
                record.ended = ended
        await asyncio.to_thread(self._persist_record, record)

    def _upsert_sector_member(self, sector_id: str, symbol: str) -> None:
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO sectors_map (sector_id, symbol)
                VALUES (?, ?)
                ON CONFLICT (sector_id, symbol) DO NOTHING
                """,
                (sector_id, symbol),
            )
            try:
                sector_snapshot.export_sectors_to_json(Path("config/sectors_snapshot_current.json"))
            except Exception:
                LOGGER.warning("Failed to export sectors snapshot to JSON", exc_info=True)
        finally:
            conn.close()

    def _delete_sector_member(self, sector_id: str, symbol: str) -> None:
        conn = self._connect()
        try:
            conn.execute(
                "DELETE FROM sectors_map WHERE sector_id = ? AND symbol = ?",
                (sector_id, symbol),
            )
            try:
                sector_snapshot.export_sectors_to_json(Path("config/sectors_snapshot_current.json"))
            except Exception:
                LOGGER.warning("Failed to export sectors snapshot to JSON", exc_info=True)
        finally:
            conn.close()

    async def _ensure_symbol_data(self, symbol: str) -> None:
        symbol_key = symbol.strip().upper()

        def _current_count() -> int:
            conn = self._connect()
            try:
                row = conn.execute(
                    "SELECT COUNT(*) FROM ticker_ohlc WHERE symbol = ?",
                    (symbol_key,),
                ).fetchone()
                return int(row[0] if row else 0)
            finally:
                conn.close()

        existing_rows = await asyncio.to_thread(_current_count)
        seed = existing_rows < eod_snapshot.MIN_HISTORY_DAYS
        if existing_rows == 0:
            inserted = await asyncio.to_thread(self._backfill_symbol_history, symbol_key)
            if inserted:
                LOGGER.info("Backfilled %d Massive rows for %s", inserted, symbol_key)
                seed = False

        provider = get_provider()
        try:
            records = await eod_snapshot.fetch_symbol_history(provider, symbol_key, seed=seed)
        finally:
            aclose = getattr(provider, "aclose", None)
            if callable(aclose):
                result = aclose()
                if asyncio.iscoroutine(result):
                    await result
        if not records and seed:
            raise RuntimeError(f"Unable to seed historical data for {symbol_key}")

        def _upsert_and_metric() -> None:
            conn = self._connect()
            try:
                if records:
                    eod_snapshot.upsert_ohlc_rows(conn, symbol_key, records)
                    eod_snapshot.prune_old_rows(conn, symbol_key)
                metric = eod_snapshot.compute_metrics(conn, symbol_key)
                if metric:
                    eod_snapshot.upsert_ticker_metrics(conn, {symbol_key: metric})
            finally:
                conn.close()

        await asyncio.to_thread(_upsert_and_metric)


def _recompute_sector_sync(sector_id: str) -> sector_snapshot.SectorRowDTO:
    conn = duckdb.connect(str(sector_snapshot.SNAPSHOT_DB))
    try:
        return sector_snapshot.recompute_sector(sector_id, conn)
    finally:
        conn.close()
