from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Optional

import httpx
import pytest


def _gen_ohlc(days: int, base: float = 100.0) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    today = dt.date.today()
    for i in range(days):
        d = today - dt.timedelta(days=(days - 1 - i))
        # Skip weekends to mimic market days a bit
        if d.weekday() >= 5:
            continue
        close = base + i * 0.5
        out.append(
            {
                "Date": dt.datetime(d.year, d.month, d.day),
                "Open": close - 0.25,
                "High": close + 0.5,
                "Low": close - 0.5,
                "Close": close,
                "Volume": 1_000_000 + i * 1000,
            }
        )
    return out


class _FakeProvider:
    def __init__(self) -> None:
        self._bars = _gen_ohlc(260)

    async def get_last_price(self, symbol: str) -> Optional[float]:
        return 123.45

    async def get_ohlc(
        self, symbol: str, *, period: str = "6mo", interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        return list(self._bars)

    async def get_vix_term(self) -> Optional[Dict[str, float]]:
        # Contango: 9D < spot < 3M
        return {"^VIX9D": 14.0, "^VIX": 16.0, "^VIX3M": 20.0}

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "name": "fake",
            "request_quota": None,
            "recent_request_ids": ["abc123"],
            "error_rate": {"success": 5, "failure": 0, "rate": 0.0},
            "base_url": "http://fake",
        }


@pytest.fixture(scope="module")
def app_instance():
    from app.main import app
    app.state.market = _FakeProvider()
    return app


@pytest.fixture()
async def aclient(app_instance):
    transport = httpx.ASGITransport(app=app_instance)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.mark.anyio("asyncio")
async def test_health(aclient: httpx.AsyncClient):
    r = await aclient.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.anyio("asyncio")
async def test_price(aclient: httpx.AsyncClient):
    r = await aclient.get("/price", params={"symbol": "AAPL"})
    assert r.status_code == 200
    data = r.json()
    assert data["symbol"] == "AAPL"
    assert isinstance(data["price"], float)


@pytest.mark.anyio("asyncio")
async def test_stock_series(aclient: httpx.AsyncClient):
    r = await aclient.get("/stock/SPY", params={"period": "6mo", "interval": "1d"})
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    assert len(rows) > 10
    sample = rows[-1]
    assert {"time", "open", "high", "low", "close", "volume"}.issubset(set(sample.keys()))


@pytest.mark.anyio("asyncio")
async def test_compass(aclient: httpx.AsyncClient):
    r = await aclient.get("/compass")
    assert r.status_code == 200
    payload = r.json()
    assert payload["state"] in {"risk-on", "risk-off", "neutral"}
    # With our fake provider, this should be risk-on (trend ~ up, vix contango)
    assert payload["components"]["vix_term"] == 1


@pytest.mark.anyio("asyncio")
async def test_metrics_trend(aclient: httpx.AsyncClient):
    r = await aclient.get("/metrics/trend", params={"symbol": "SPY"})
    assert r.status_code == 200
    data = r.json()
    assert data["symbol"] == "SPY"
    # Should have computed fields
    assert data["price"] is not None
    assert data["sma50"] is not None


@pytest.mark.anyio("asyncio")
async def test_metrics_momentum(aclient: httpx.AsyncClient):
    r = await aclient.get("/metrics/momentum", params={"symbol": "QQQ"})
    assert r.status_code == 200
    data = r.json()
    # With ample synthetic data, 5d and 1m should compute
    assert data["r5d_pct"] is not None
    assert data["r1m_pct"] is not None


@pytest.mark.anyio("asyncio")
async def test_metrics_trend_lite(aclient: httpx.AsyncClient):
    symbols = "SPY,QQQ,SPY"
    r = await aclient.get("/metrics/trend/lite", params={"symbols": symbols})
    assert r.status_code == 200
    payload = r.json()
    assert isinstance(payload, list)
    assert len(payload) == 2  # duplicates stripped
    symbols_returned = {entry["symbol"] for entry in payload}
    assert {"SPY", "QQQ"} == symbols_returned


@pytest.mark.anyio("asyncio")
async def test_metrics_rsi(aclient: httpx.AsyncClient):
    r = await aclient.get("/metrics/rsi", params={"symbol": "IWM"})
    assert r.status_code == 200
    data = r.json()
    if data["rsi"] is not None:
        assert 0.0 <= data["rsi"] <= 100.0


@pytest.mark.anyio("asyncio")
async def test_metrics_vix(aclient: httpx.AsyncClient):
    r = await aclient.get("/metrics/vix")
    assert r.status_code == 200
    data = r.json()
    # With synthetic series, we should have a value and possibly avg7
    assert data["value"] is not None


@pytest.mark.anyio("asyncio")
async def test_returns(aclient: httpx.AsyncClient):
    r = await aclient.get("/metrics/returns", params={"symbol": "SPY", "windows": "MTD,YTD"})
    assert r.status_code == 200
    data = r.json()
    assert "MTD" in data and "YTD" in data


@pytest.mark.anyio("asyncio")
async def test_screen(aclient: httpx.AsyncClient):
    r = await aclient.get("/screen", params={"symbols": "AAPL,MSFT"})
    assert r.status_code == 200
    data = r.json()
    assert "results" in data
    assert len(data["results"]) == 2


@pytest.mark.anyio("asyncio")
@pytest.mark.anyio("asyncio")
async def test_debug_market_data(aclient: httpx.AsyncClient):
    r = await aclient.get("/debug/market-data")
    assert r.status_code == 200
    payload = r.json()
    assert payload["name"] == "fake"
    assert isinstance(payload["recent_request_ids"], list)
