from __future__ import annotations

import datetime as dt
from types import SimpleNamespace

import pytest

from engine.providers.massive_provider import MassiveMarketData


class _FakeAgg(SimpleNamespace):
    pass


class _FakeRESTClient:
    def __init__(self, *, raise_on=None, **kwargs):
        self.raise_on = raise_on or {}
        self.closed = False

    def list_aggs(self, **kwargs):
        if self.raise_on.get("list_aggs"):
            raise self.raise_on["list_aggs"]
        yield _FakeAgg(
            timestamp=dt.datetime(2024, 1, 1, 0, 0, tzinfo=dt.timezone.utc),
            open=100.0,
            high=102.0,
            low=99.0,
            close=101.0,
            volume=5_000_000,
        )

    def get_previous_close_agg(self, ticker: str, adjusted: bool = False):
        if self.raise_on.get("get_previous_close_agg"):
            raise self.raise_on["get_previous_close_agg"]
        return SimpleNamespace(
            results=[SimpleNamespace(close=42.0 if ticker.endswith("9D") else 44.0 if ticker.endswith("VIX") else 46.0)]
        )

    def close(self):
        self.closed = True


@pytest.fixture(autouse=True)
def patch_rest_client(monkeypatch):
    def _factory(*args, **kwargs):
        raise_on = kwargs.pop("_raise_on", None)
        fake = _FakeRESTClient(raise_on=raise_on or {})
        return fake

    monkeypatch.setattr("engine.providers.massive_provider.RESTClient", _factory)


@pytest.mark.anyio("asyncio")
async def test_market_data_flow(monkeypatch):
    market = MassiveMarketData(api_key="fake-key")

    bars = await market.get_ohlc("SPY", period="5d", interval="1d")
    assert len(bars) == 1
    bar = bars[0]
    assert bar["close"] == 101.0
    assert bar["volume"] == 5_000_000
    assert bar["dollar_volume"] == pytest.approx(505_000_000)

    price = await market.get_last_price("SPY")
    assert price == pytest.approx(46.0)  # previous close fallback

    vix = await market.get_vix_term()
    assert vix == {"^VIX9D": 42.0, "^VIX": 44.0, "^VIX3M": 46.0}

    diag = market.diagnostics()
    assert diag["error_rate"]["failure"] == 0

    await market.aclose()


@pytest.mark.anyio("asyncio")
async def test_market_data_failure(monkeypatch):
    error = RuntimeError("boom")

    def _factory(*args, **kwargs):
        return _FakeRESTClient(raise_on={"list_aggs": error, "get_previous_close_agg": error})

    monkeypatch.setattr("engine.providers.massive_provider.RESTClient", _factory)

    market = MassiveMarketData(api_key="fake", retries=0)
    with pytest.raises(RuntimeError):
        await market.get_ohlc("SPY")
    with pytest.raises(RuntimeError):
        await market.get_last_price("SPY")
    with pytest.raises(RuntimeError):
        await market.get_vix_term()

    diag = market.diagnostics()
    assert diag["error_rate"]["failure"] > 0
