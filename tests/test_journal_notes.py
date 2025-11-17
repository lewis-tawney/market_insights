from __future__ import annotations

import datetime as dt
from typing import AsyncIterator, Dict, Any

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


def _make_entry_time(days: int = 0) -> str:
    base = dt.datetime(2024, 1, 1, 14, 0, 0, tzinfo=dt.timezone.utc)
    return (base + dt.timedelta(days=days)).isoformat()


async def _create_trade(
    client: httpx.AsyncClient, ticker: str, entry_price: float, exit_price: float
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "ticker": ticker,
        "direction": "long",
        "status": "closed",
        "entry_price": entry_price,
        "exit_price": exit_price,
        "position_size": 5.0,
        "entry_time": _make_entry_time(),
        "exit_time": _make_entry_time(1),
    }
    r = await client.post("/journal/trades", json=payload)
    assert r.status_code == 201
    return r.json()


@pytest.mark.anyio("asyncio")
async def test_daily_note_flow(aclient: httpx.AsyncClient):
    trade1 = await _create_trade(aclient, "AAPL", 100.0, 110.0)
    trade2 = await _create_trade(aclient, "AAPL", 90.0, 95.0)

    note_payload = {
        "date": "2024-02-01",
        "premarket_notes": "Focus on semis",
        "eod_notes": "Followed the plan",
    }
    create_resp = await aclient.post("/journal/daily-notes", json=note_payload)
    assert create_resp.status_code == 200
    note = create_resp.json()

    attach_payload = {
        "trade_ids": [trade1["id"], trade2["id"]],
        "role": "taken",
    }
    attach_resp = await aclient.post(
        f"/journal/daily-notes/{note['id']}/trades",
        json=attach_payload,
    )
    assert attach_resp.status_code == 201

    trades_resp = await aclient.get(f"/journal/daily-notes/{note['id']}/trades")
    assert trades_resp.status_code == 200
    payload = trades_resp.json()
    assert payload["note"]["premarket_notes"] == "Focus on semis"
    linked_ids = {trade["id"] for trade in payload["trades"]}
    assert {trade1["id"], trade2["id"]} == linked_ids

    list_resp = await aclient.get("/journal/daily-notes", params={"start_date": "2024-02-01"})
    assert list_resp.status_code == 200
    assert any(entry["id"] == note["id"] for entry in list_resp.json())

    # detach and ensure removal
    del_resp = await aclient.delete(
        f"/journal/daily-notes/{note['id']}/trades/{trade2['id']}"
    )
    assert del_resp.status_code == 204
    after_resp = await aclient.get(f"/journal/daily-notes/{note['id']}/trades")
    assert after_resp.status_code == 200
    remaining_ids = {trade["id"] for trade in after_resp.json()["trades"]}
    assert trade2["id"] not in remaining_ids


@pytest.mark.anyio("asyncio")
async def test_weekly_note_flow(aclient: httpx.AsyncClient):
    trade1 = await _create_trade(aclient, "MSFT", 50.0, 55.0)
    trade2 = await _create_trade(aclient, "TSLA", 200.0, 210.0)

    note_payload = {
        "week_start_date": "2024-01-29",
        "week_end_date": "2024-02-02",
        "text": "Volatile week",
    }
    create_resp = await aclient.post("/journal/weekly-notes", json=note_payload)
    assert create_resp.status_code == 200
    note = create_resp.json()
    assert note["trade_count"] == 0

    attach_payload = {
        "trade_ids": [trade1["id"], trade2["id"]],
        "role": "planned",
    }
    attach_resp = await aclient.post(
        f"/journal/weekly-notes/{note['id']}/trades",
        json=attach_payload,
    )
    assert attach_resp.status_code == 201
    trades_payload = attach_resp.json()
    assert trades_payload["note"]["trade_count"] == 2

    trades_resp = await aclient.get(f"/journal/weekly-notes/{note['id']}/trades")
    assert trades_resp.status_code == 200
    linked = trades_resp.json()
    assert len(linked["trades"]) == 2

    list_resp = await aclient.get(
        "/journal/weekly-notes",
        params={"start_week": "2024-01-01", "end_week": "2024-02-28"},
    )
    assert list_resp.status_code == 200
    assert any(entry["id"] == note["id"] for entry in list_resp.json())

    del_resp = await aclient.delete(
        f"/journal/weekly-notes/{note['id']}/trades/{trade1['id']}"
    )
    assert del_resp.status_code == 204
    refreshed = await aclient.get(f"/journal/weekly-notes/{note['id']}")
    assert refreshed.status_code == 200
    assert refreshed.json()["trade_count"] == 1
