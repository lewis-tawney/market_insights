from __future__ import annotations

import asyncio
import json
import hashlib
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

import duckdb
import httpx
import pytest

from app.main import app
from app.services.jobs import JobManager
from app.services import sector_snapshot
from app.schemas.sector_volume import TickerMetricDTO
from server.jobs import eod_snapshot


@pytest.fixture()
async def jobs_app(tmp_path, monkeypatch):
    previous_manager = getattr(app.state, "jobs", None)
    if previous_manager is not None:
        await previous_manager.stop()

    db_path = tmp_path / "jobs.duckdb"
    snapshots_dir = tmp_path / "snapshots"
    snapshots_dir.mkdir()
    checksum_dir = snapshots_dir / "checksums"
    checksum_dir.mkdir()
    latest_path = snapshots_dir / "sectors_volume_latest.json"

    monkeypatch.setattr(sector_snapshot, "SNAPSHOT_DB", db_path)
    monkeypatch.setattr(sector_snapshot, "SNAPSHOT_DIR", snapshots_dir)
    monkeypatch.setattr(sector_snapshot, "SNAPSHOT_CHECKSUM_DIR", checksum_dir)
    monkeypatch.setattr(sector_snapshot, "LATEST_SNAPSHOT_JSON", latest_path)

    manager = JobManager(db_path)
    app.state.jobs = manager
    app.state.test_context = {
        "db_path": db_path,
        "snapshots_dir": snapshots_dir,
        "checksum_dir": checksum_dir,
        "latest_path": latest_path,
    }
    await manager.start()

    yield app

    await manager.stop()
    app.state.jobs = previous_manager
    if hasattr(app.state, "test_context"):
        delattr(app.state, "test_context")


@pytest.mark.anyio("asyncio")
async def test_dummy_task_lifecycle(jobs_app):
    transport = httpx.ASGITransport(app=jobs_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post("/tasks/dummy")
        assert response.status_code == 202
        task_id = response.json()["task_id"]

        status_resp = await client.get(f"/tasks/{task_id}")
        assert status_resp.status_code == 200
        assert status_resp.json()["status"] in {"queued", "running", "succeeded"}

        record = await jobs_app.state.jobs.wait(task_id, timeout=5)
        assert record.status == "succeeded"

        final_resp = await client.get(f"/tasks/{task_id}")
        assert final_resp.status_code == 200
        payload = final_resp.json()
        assert payload["status"] == "succeeded"
        assert payload["started"] is not None
        assert payload["ended"] is not None

    conn = duckdb.connect(str(sector_snapshot.SNAPSHOT_DB))
    rows = conn.execute("SELECT status FROM job_runs WHERE id = ?", (task_id,)).fetchall()
    conn.close()
    assert rows and rows[0][0] == "succeeded"


def _seed_sector_data(db_path: Path, sector_id: str, symbols: Optional[list[str]] = None) -> None:
    conn = duckdb.connect(str(db_path))
    try:
        eod_snapshot.ensure_tables(conn)
        conn.execute(
            "INSERT OR REPLACE INTO sector_definitions (sector_id, name, sort_order) VALUES (?, ?, ?)",
            (sector_id, sector_id.title(), 0),
        )
        base_symbols = symbols if symbols is not None else ["AAA"]
        for sym in base_symbols:
            conn.execute(
                "INSERT OR REPLACE INTO sectors_map (sector_id, symbol) VALUES (?, ?)",
                (sector_id, sym),
            )
        start = date(2024, 1, 1)
        for sym_index, sym in enumerate(base_symbols):
            base_price = 100.0 + sym_index * 10.0
            for offset in range(12):
                current = start + timedelta(days=offset)
                close = base_price + offset
                volume = 1_000_000 + offset * 1000
                conn.execute(
                    """
                    INSERT INTO ticker_ohlc (symbol, date, close, volume, dollar_volume)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (sym, current, close, volume, close * volume),
                )
    finally:
        conn.close()


def _initial_snapshot_payload(sector_id: str) -> Dict[str, Any]:
    return {
        "snapshot_date": "2024-01-05",
        "generated_at": "2024-01-05T20:00:00+00:00",
        "sectors": [
            {
                "id": sector_id,
                "name": sector_id.title(),
                "members": ["AAA"],
                "relVol10_median": 1.0,
                "dollarVol_today_sum": 100.0,
                "avgDollarVol10_sum": 95.0,
                "change1d_median": 0.5,
                "change1d_weighted": 0.5,
                "change5d_weighted": 0.6,
                "leaders": [],
                "lastUpdated": "2024-01-04",
                "members_detail": [
                    TickerMetricDTO(
                        ticker="AAA",
                        change1d=0.5,
                        change5d=1.0,
                        relVol10=1.1,
                        dollarVolToday=100.0,
                        avgDollarVol10=95.0,
                        lastUpdated="2024-01-04",
                        dollarVol5d=480.0,
                        inactive=False,
                        history=[{"date": "2024-01-04", "close": 101.0, "volume": 1_010_000.0, "dollarVolume": 102_000_000.0}],
                    ).model_dump(),
                ],
            }
        ],
        "sectors_count": 1,
        "members_count": 1,
        "ticker_metrics": {
            "AAA": {
                "last_date": "2024-01-04",
            }
        },
        "inactive_tickers": [],
    }


@pytest.mark.anyio("asyncio")
async def test_concurrent_sector_patch_is_serialized(tmp_path, monkeypatch):
    db_path = tmp_path / "market.duckdb"
    snapshots_dir = tmp_path / "snapshots"
    snapshots_dir.mkdir()
    checksum_dir = snapshots_dir / "checksums"
    checksum_dir.mkdir()
    latest_path = snapshots_dir / "sectors_volume_latest.json"

    monkeypatch.setattr(sector_snapshot, "SNAPSHOT_DB", db_path)
    monkeypatch.setattr(sector_snapshot, "SNAPSHOT_DIR", snapshots_dir)
    monkeypatch.setattr(sector_snapshot, "SNAPSHOT_CHECKSUM_DIR", checksum_dir)
    monkeypatch.setattr(sector_snapshot, "LATEST_SNAPSHOT_JSON", latest_path)

    _seed_sector_data(db_path, "ALPHA")

    payload = _initial_snapshot_payload("ALPHA")
    latest_path.write_text(json.dumps(payload, indent=2, sort_keys=True))
    (checksum_dir / f"{latest_path.name}.sha256").write_text("initial\n")

    manager = JobManager(db_path)
    await manager.start()

    try:
        task1 = await manager.enqueue_sector_patch("ALPHA")
        task2 = await manager.enqueue_sector_patch("ALPHA")
        await asyncio.gather(manager.wait(task1, timeout=5), manager.wait(task2, timeout=5))
    finally:
        await manager.stop()

    final_payload = json.loads(latest_path.read_text())
    assert final_payload["sectors_count"] == 1
    sectors = final_payload["sectors"]
    assert len(sectors) == 1
    assert sectors[0]["id"] == "ALPHA"
    assert final_payload["members_count"] == len(sectors[0]["members"])

    checksum_contents = (checksum_dir / f"{latest_path.name}.sha256").read_text().strip()
    assert checksum_contents == hashlib.sha256(latest_path.read_bytes()).hexdigest()

    conn = duckdb.connect(str(db_path))
    row_count = conn.execute("SELECT COUNT(*) FROM job_runs WHERE kind = 'sector_patch'").fetchone()[0]
    conn.close()
    assert row_count == 2


@pytest.mark.anyio("asyncio")
async def test_add_ticker_endpoint_updates_snapshot(jobs_app, monkeypatch):
    ctx = jobs_app.state.test_context
    db_path: Path = ctx["db_path"]
    latest_path: Path = ctx["latest_path"]
    checksum_dir: Path = ctx["checksum_dir"]

    _seed_sector_data(db_path, "ALPHA")
    initial_payload = _initial_snapshot_payload("ALPHA")
    latest_path.write_text(json.dumps(initial_payload, indent=2, sort_keys=True))
    (checksum_dir / f"{latest_path.name}.sha256").write_text("seed\n")

    records = [
        {
            "Date": datetime(2024, 1, 1) + timedelta(days=i),
            "Close": 50.0 + i,
            "Volume": 1_000_000 + i * 10_000,
        }
        for i in range(12)
    ]

    class FakeProvider:
        async def get_ohlc(self, symbol: str, *, period: str = "1d", interval: str = "1d"):
            return records

    monkeypatch.setattr("app.services.jobs.get_provider", lambda: FakeProvider())
    monkeypatch.setattr(eod_snapshot, "get_provider", lambda _cfg=None: FakeProvider())

    transport = httpx.ASGITransport(app=jobs_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/sectors/alpha/tickers",
            json={"symbol": "bbb"},
            headers={"Authorization": "Bearer "},
        )
        assert response.status_code == 202
        task_id = response.json()["task_id"]

        await jobs_app.state.jobs.wait(task_id, timeout=5)

    final_payload = json.loads(latest_path.read_text())
    sector = final_payload["sectors"][0]
    assert set(sector["members"]) == {"AAA", "BBB"}

    conn = duckdb.connect(str(db_path))
    rows = conn.execute(
        "SELECT symbol FROM sectors_map WHERE sector_id = ? ORDER BY symbol",
        ("ALPHA",),
    ).fetchall()
    conn.close()
    assert [row[0] for row in rows] == ["AAA", "BBB"]

    conn = duckdb.connect(str(db_path))
    db_row = conn.execute(
        "SELECT meta FROM job_runs WHERE id = ?",
        (task_id,),
    ).fetchone()
    conn.close()
    meta = json.loads(db_row[0]) if db_row and db_row[0] else {}
    assert meta.get("sector_id") == "ALPHA"
    assert meta.get("symbol") == "BBB"


@pytest.mark.anyio("asyncio")
async def test_remove_ticker_endpoint_updates_snapshot(jobs_app, monkeypatch):
    ctx = jobs_app.state.test_context
    db_path: Path = ctx["db_path"]
    latest_path: Path = ctx["latest_path"]
    checksum_dir: Path = ctx["checksum_dir"]

    _seed_sector_data(db_path, "BETA", symbols=["AAA", "BBB"])
    payload = _initial_snapshot_payload("BETA")
    payload["sectors"][0]["members"].append("BBB")
    payload["members_count"] = 2
    latest_path.write_text(json.dumps(payload, indent=2, sort_keys=True))
    (checksum_dir / f"{latest_path.name}.sha256").write_text("seed\n")

    records = [
        {
            "Date": datetime(2024, 1, 1) + timedelta(days=i),
            "Close": 60.0 + i,
            "Volume": 900_000 + i * 5000,
        }
        for i in range(12)
    ]

    class FakeProvider:
        async def get_ohlc(self, symbol: str, *, period: str = "1d", interval: str = "1d"):
            return records

    monkeypatch.setattr("app.services.jobs.get_provider", lambda: FakeProvider())
    monkeypatch.setattr(eod_snapshot, "get_provider", lambda _cfg=None: FakeProvider())

    transport = httpx.ASGITransport(app=jobs_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.delete(
            "/sectors/beta/tickers/BBB",
            headers={"Authorization": "Bearer "},
        )
        assert response.status_code == 202
        task_id = response.json()["task_id"]
        await jobs_app.state.jobs.wait(task_id, timeout=5)

    final_payload = json.loads(latest_path.read_text())
    sector_members = final_payload["sectors"][0]["members"]
    assert sector_members == ["AAA"]

    conn = duckdb.connect(str(db_path))
    rows = conn.execute(
        "SELECT symbol FROM sectors_map WHERE sector_id = ? ORDER BY symbol",
        ("BETA",),
    ).fetchall()
    conn.close()
    assert [row[0] for row in rows] == ["AAA"]


@pytest.mark.anyio("asyncio")
async def test_add_ticker_failure_does_not_change_snapshot(jobs_app, monkeypatch):
    ctx = jobs_app.state.test_context
    db_path: Path = ctx["db_path"]
    latest_path: Path = ctx["latest_path"]
    checksum_dir: Path = ctx["checksum_dir"]

    _seed_sector_data(db_path, "GAMMA")
    original_payload = _initial_snapshot_payload("GAMMA")
    latest_path.write_text(json.dumps(original_payload, indent=2, sort_keys=True))
    (checksum_dir / f"{latest_path.name}.sha256").write_text("seed\n")

    async def failing_fetch(provider, symbol: str, seed: bool):
        return []

    monkeypatch.setattr(eod_snapshot, "fetch_symbol_history", failing_fetch)
    monkeypatch.setattr("app.services.jobs.get_provider", lambda: object())
    monkeypatch.setattr(eod_snapshot, "get_provider", lambda _cfg=None: object())

    transport = httpx.ASGITransport(app=jobs_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/sectors/gamma/tickers",
            json={"symbol": "zzz"},
            headers={"Authorization": "Bearer "},
        )
        assert response.status_code == 202
        task_id = response.json()["task_id"]
        record = await jobs_app.state.jobs.wait(task_id, timeout=5)
        assert record.status == "failed"

    after_payload = json.loads(latest_path.read_text())
    assert after_payload == original_payload


@pytest.mark.anyio("asyncio")
async def test_fetch_symbol_history_singleflight(monkeypatch):
    call_count = {"value": 0}

    class FakeProvider:
        async def get_ohlc(self, symbol: str, period: str = "1d", interval: str = "1d"):
            call_count["value"] += 1
            await asyncio.sleep(0.05)
            return [
                {"Date": datetime(2024, 1, 1), "Close": 10.0, "Volume": 1_000_000.0},
                {"Date": datetime(2024, 1, 2), "Close": 11.0, "Volume": 1_010_000.0},
            ]

    provider = FakeProvider()
    results = await asyncio.gather(
        eod_snapshot.fetch_symbol_history(provider, "dupe", seed=True),
        eod_snapshot.fetch_symbol_history(provider, "DUPE", seed=True),
    )
    assert len(results) == 2
    assert call_count["value"] == 1
