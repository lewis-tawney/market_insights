from __future__ import annotations

import datetime as dt
from typing import AsyncIterator
from uuid import UUID

import httpx
import pytest


@pytest.fixture()
def journal_temp_db(tmp_path, monkeypatch):
    from app.services import journal_db

    temp_db = tmp_path / "journal.duckdb"
    monkeypatch.setattr(journal_db, "JOURNAL_DB", temp_db)
    return temp_db


@pytest.fixture()
def app_instance(journal_temp_db):
    from app.main import app

    return app


@pytest.fixture()
async def aclient(app_instance) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app_instance)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


def _make_entry_time() -> dt.datetime:
    return dt.datetime(2024, 1, 1, 10, 0, 0, tzinfo=dt.timezone.utc)


def _make_exit_time() -> dt.datetime:
    return dt.datetime(2024, 1, 2, 10, 0, 0, tzinfo=dt.timezone.utc)


@pytest.mark.anyio("asyncio")
async def test_create_and_get_trade(aclient: httpx.AsyncClient):
    payload = {
        "ticker": "AAPL",
        "direction": "long",
        "status": "open",
        "entry_price": 100.0,
        "position_size": 10.0,
        "entry_time": _make_entry_time().isoformat(),
        "stop_price": 95.0,
        "what_they_saw": "Breakout",
        "exit_plan": "Trail stop",
        "feelings": "Calm",
        "notes": "Initial entry",
    }

    r = await aclient.post("/journal/trades", json=payload)
    assert r.status_code == 201
    created = r.json()
    trade_id = created["id"]
    assert created["ticker"] == "AAPL"
    assert created["status"] == "open"
    assert created["percent_pl"] is None

    r2 = await aclient.get(f"/journal/trades/{trade_id}")
    assert r2.status_code == 200
    fetched = r2.json()
    assert fetched["id"] == trade_id
    assert fetched["ticker"] == "AAPL"


@pytest.mark.anyio("asyncio")
async def test_list_trades_filters(aclient: httpx.AsyncClient):
    payload = {
        "ticker": "AAPL",
        "direction": "long",
        "status": "open",
        "entry_price": 120.0,
        "position_size": 5.0,
        "entry_time": _make_entry_time().isoformat(),
    }
    resp = await aclient.post("/journal/trades", json=payload)
    assert resp.status_code == 201

    r = await aclient.get("/journal/trades", params={"ticker": "AAPL", "status": "open"})
    assert r.status_code == 200
    trades = r.json()
    assert isinstance(trades, list)
    assert any(t["ticker"] == "AAPL" for t in trades)


@pytest.mark.anyio("asyncio")
async def test_update_and_metrics(aclient: httpx.AsyncClient):
    entry_time = _make_entry_time()
    exit_time = _make_exit_time()

    create_payload = {
        "ticker": "MSFT",
        "direction": "long",
        "status": "open",
        "entry_price": 50.0,
        "position_size": 20.0,
        "entry_time": entry_time.isoformat(),
        "stop_price": 45.0,
    }
    r = await aclient.post("/journal/trades", json=create_payload)
    assert r.status_code == 201
    trade = r.json()
    trade_id = trade["id"]

    update_payload = {
        "status": "closed",
        "exit_price": 60.0,
        "exit_time": exit_time.isoformat(),
    }
    r2 = await aclient.patch(f"/journal/trades/{trade_id}", json=update_payload)
    assert r2.status_code == 200
    updated = r2.json()
    assert updated["status"] == "closed"

    # entry 50 -> exit 60 on 20 shares: $200 P&L, 20% gain, 2R (risk 5 per share)
    assert pytest.approx(updated["percent_pl"], rel=1e-6) == 20.0
    assert pytest.approx(updated["dollar_pl"], rel=1e-6) == 200.0
    assert updated["hold_time_seconds"] == 24 * 60 * 60
    assert pytest.approx(updated["r_multiple"], rel=1e-6) == 2.0


@pytest.mark.anyio("asyncio")
async def test_delete_trade(aclient: httpx.AsyncClient):
    payload = {
        "ticker": "TSLA",
        "direction": "short",
        "status": "open",
        "entry_price": 200.0,
        "position_size": 5.0,
        "entry_time": _make_entry_time().isoformat(),
    }
    r = await aclient.post("/journal/trades", json=payload)
    assert r.status_code == 201
    trade_id = r.json()["id"]

    r_del = await aclient.delete(f"/journal/trades/{trade_id}")
    assert r_del.status_code == 204

    r_get = await aclient.get(f"/journal/trades/{trade_id}")
    assert r_get.status_code == 404
