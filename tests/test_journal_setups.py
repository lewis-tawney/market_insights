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


def _make_time(days: int = 0) -> str:
    base = dt.datetime(2024, 1, 1, 14, 0, 0, tzinfo=dt.timezone.utc)
    return (base + dt.timedelta(days=days)).isoformat()


async def _create_trade(
    client: httpx.AsyncClient,
    *,
    ticker: str = "AAPL",
    direction: str = "long",
    status: str = "open",
    entry_price: float = 100.0,
    exit_price: float | None = None,
    position_size: float = 10.0,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "ticker": ticker,
        "direction": direction,
        "status": status,
        "entry_price": entry_price,
        "position_size": position_size,
        "entry_time": _make_time(),
    }
    if exit_price is not None:
        payload["exit_price"] = exit_price
        payload["exit_time"] = _make_time(1)

    r = await client.post("/journal/trades", json=payload)
    assert r.status_code == 201
    return r.json()


async def _create_setup(client: httpx.AsyncClient, name: str) -> Dict[str, Any]:
    payload = {"name": name, "description": "Playbook entry", "rules": ["Rule 1", "Rule 2"]}
    r = await client.post("/journal/setups", json=payload)
    assert r.status_code == 201
    return r.json()


@pytest.mark.anyio("asyncio")
async def test_create_setup_and_list(aclient: httpx.AsyncClient):
    setup = await _create_setup(aclient, "Breakout")

    r = await aclient.get("/journal/setups")
    assert r.status_code == 200
    payload = r.json()
    assert any(entry["id"] == setup["id"] for entry in payload)


@pytest.mark.anyio("asyncio")
async def test_setup_review_and_ticker_profile_flow(aclient: httpx.AsyncClient):
    setup = await _create_setup(aclient, "First Pullback")
    trade = await _create_trade(
        aclient,
        ticker="NVDA",
        status="closed",
        entry_price=50.0,
        exit_price=60.0,
        position_size=5.0,
    )

    review_payload = {
        "ticker_symbol": "nvda",
        "setup_id": setup["id"],
        "trade_id": trade["id"],
        "date": "2024-01-03",
        "notes": "Great execution",
        "did_take_trade": True,
    }
    r_review = await aclient.post("/journal/setup-reviews", json=review_payload)
    assert r_review.status_code == 201
    review = r_review.json()

    profile = await aclient.get("/journal/tickers/NVDA")
    assert profile.status_code == 200
    data = profile.json()
    assert data["ticker"]["symbol"] == "NVDA"
    assert any(t["id"] == trade["id"] for t in data["trades"])
    assert any(r["id"] == review["id"] for r in data["setup_reviews"])

    winners = await aclient.get("/journal/tickers/NVDA", params={"outcome": "winners"})
    assert winners.status_code == 200
    assert len(winners.json()["trades"]) == 1

    losers = await aclient.get("/journal/tickers/NVDA", params={"outcome": "losers"})
    assert losers.status_code == 200
    assert losers.json()["trades"] == []


@pytest.mark.anyio("asyncio")
async def test_setup_review_filters_and_screenshots(aclient: httpx.AsyncClient):
    setup = await _create_setup(aclient, "Trend Continuation")
    trade = await _create_trade(aclient, ticker="TSLA")

    review_payload = {
        "ticker_symbol": "TSLA",
        "setup_id": setup["id"],
        "trade_id": trade["id"],
        "date": "2024-01-05",
        "notes": "Watch volume next time",
        "did_take_trade": True,
    }
    review_resp = await aclient.post("/journal/setup-reviews", json=review_payload)
    assert review_resp.status_code == 201
    review = review_resp.json()

    listing = await aclient.get(
        "/journal/setup-reviews",
        params={
            "ticker_symbol": "TSLA",
            "setup_id": setup["id"],
            "did_take_trade": True,
        },
    )
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    empty_listing = await aclient.get(
        "/journal/setup-reviews",
        params={
            "ticker_symbol": "TSLA",
            "setup_id": setup["id"],
            "did_take_trade": False,
        },
    )
    assert empty_listing.status_code == 200
    assert empty_listing.json() == []

    trade_shot = {"url": "http://example.com/trade.png", "caption": "Entry"}
    r_trade_shot = await aclient.post(
        f"/journal/trades/{trade['id']}/screenshots", json=trade_shot
    )
    assert r_trade_shot.status_code == 201

    review_shot = {"url": "http://example.com/review.png", "caption": "Levels"}
    r_review_shot = await aclient.post(
        f"/journal/setup-reviews/{review['id']}/screenshots", json=review_shot
    )
    assert r_review_shot.status_code == 201

    trade_shots = await aclient.get(f"/journal/trades/{trade['id']}/screenshots")
    assert trade_shots.status_code == 200
    assert len(trade_shots.json()) == 1

    review_shots = await aclient.get(f"/journal/setup-reviews/{review['id']}/screenshots")
    assert review_shots.status_code == 200
    assert len(review_shots.json()) == 1

