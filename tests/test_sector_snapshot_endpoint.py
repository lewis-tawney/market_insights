from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Any

import httpx
import pytest

from app.main import app
from app.security import SecurityManager
from app.services import sector_snapshot as snapshot_module


@pytest.fixture()
def snapshot_context(tmp_path, monkeypatch) -> Dict[str, Any]:
    data_dir = tmp_path / "data"
    snapshots_dir = tmp_path / "snapshots"
    data_dir.mkdir()
    snapshots_dir.mkdir()

    latest_path = snapshots_dir / "sectors_volume_latest.json"

    payload = {
        "snapshot_date": "2024-01-05",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sectors": [
            {
                "id": "tech",
                "name": "Technology",
                "members": ["AAA", "BBB"],
                "relVol10_median": 1.25,
                "dollarVol_today_sum": 1_500_000.0,
                "avgDollarVol10_sum": 1_200_000.0,
                "change1d_median": 0.5,
                "leaders": [
                    {"ticker": "AAA", "relVol10": 1.5, "change1d": 2.0},
                    {"ticker": "BBB", "relVol10": 1.2, "change1d": -0.5},
                ],
                "spark10": [0.1, -0.05, 0.2],
                "lastUpdated": "2024-01-05",
            }
        ],
        "ticker_metrics": {
            "AAA": {
                "last_date": "2024-01-05",
                "dollar_vol_today": 900000.0,
                "avg_dollar_vol10": 600000.0,
                "rel_vol10": 1.5,
                "change1d": 2.0,
                "spark10": [
                    {"date": "2024-01-03", "change": 0.4},
                    {"date": "2024-01-04", "change": -0.1},
                    {"date": "2024-01-05", "change": 2.0},
                ],
            },
            "BBB": {
                "last_date": "2024-01-05",
                "dollar_vol_today": 600000.0,
                "avg_dollar_vol10": 600000.0,
                "rel_vol10": 1.0,
                "change1d": -0.5,
                "spark10": [
                    {"date": "2024-01-03", "change": 0.2},
                    {"date": "2024-01-04", "change": -0.3},
                    {"date": "2024-01-05", "change": -0.5},
                ],
            },
        },
        "inactive_tickers": [],
    }

    latest_path.write_text(json.dumps(payload))

    monkeypatch.setattr(snapshot_module, "DATA_DIR", data_dir)
    monkeypatch.setattr(snapshot_module, "SNAPSHOT_DIR", snapshots_dir)
    monkeypatch.setattr(snapshot_module, "LATEST_SNAPSHOT_JSON", latest_path)
    monkeypatch.setattr(snapshot_module, "SNAPSHOT_DB", data_dir / "market.duckdb")

    return {"payload": payload, "latest_path": latest_path}


@pytest.fixture()
async def snapshot_client(snapshot_context):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.mark.anyio("asyncio")
async def test_sectors_volume_requires_auth(snapshot_client):
    original_security = app.state.security
    app.state.security = SecurityManager(allowed_ips=set(), read_api_token="token123")
    try:
        r_missing = await snapshot_client.get("/metrics/sectors/volume")
        assert r_missing.status_code == 401

        r_invalid = await snapshot_client.get(
            "/metrics/sectors/volume",
            headers={"Authorization": "Bearer wrong"},
        )
        assert r_invalid.status_code == 403
    finally:
        app.state.security = original_security


@pytest.mark.anyio("asyncio")
async def test_sectors_volume_returns_snapshot_with_headers(snapshot_client, snapshot_context):
    original_security = app.state.security
    app.state.security = SecurityManager(
        allowed_ips=set(),
        read_api_token="token123",
        rate_limit_per_minute=5,
        burst_size=2,
    )
    try:
        resp = await snapshot_client.get(
            "/metrics/sectors/volume",
            headers={"Authorization": "Bearer token123"},
        )
        assert resp.status_code == 200
        payload = resp.json()
        assert isinstance(payload, list)
        assert payload
        assert payload[0]["id"] == snapshot_context["payload"]["sectors"][0]["id"]
        assert resp.headers.get("X-RateLimit-Limit") == "5"
        remaining = resp.headers.get("X-RateLimit-Remaining")
        assert remaining is not None
        assert remaining.isdigit()
    finally:
        app.state.security = original_security


@pytest.mark.anyio("asyncio")
async def test_sectors_volume_rate_limited(snapshot_client):
    original_security = app.state.security
    app.state.security = SecurityManager(
        allowed_ips=set(),
        read_api_token="token123",
        rate_limit_per_minute=1,
        burst_size=1,
    )
    headers = {"Authorization": "Bearer token123"}
    try:
        ok = await snapshot_client.get("/metrics/sectors/volume", headers=headers)
        assert ok.status_code == 200
        limited = await snapshot_client.get("/metrics/sectors/volume", headers=headers)
        assert limited.status_code == 429
        retry_after = limited.headers.get("Retry-After")
        assert retry_after is not None
        assert int(retry_after) >= 1
    finally:
        app.state.security = original_security


@pytest.mark.anyio("asyncio")
async def test_snapshot_health_ok(snapshot_client, snapshot_context):
    resp = await snapshot_client.get("/health/snapshot")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["asOfDate"] == snapshot_context["payload"]["snapshot_date"]
    assert payload["stale"] is False
    assert payload["sectors_count"] == len(snapshot_context["payload"]["sectors"])
    assert payload["members_count"] == len(snapshot_context["payload"]["sectors"][0]["members"])


@pytest.mark.anyio("asyncio")
async def test_snapshot_health_stale(snapshot_client, snapshot_context):
    stale_payload = json.loads(snapshot_context["latest_path"].read_text())
    stale_payload["generated_at"] = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    snapshot_context["latest_path"].write_text(json.dumps(stale_payload))

    resp = await snapshot_client.get("/health/snapshot")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["stale"] is True


@pytest.mark.anyio("asyncio")
async def test_snapshot_health_missing(snapshot_context):
    snapshot_context["latest_path"].unlink()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        resp = await client.get("/health/snapshot")
    assert resp.status_code == 503
