# app/routes/api.py
from __future__ import annotations

import json
import time
from math import isnan
from typing import Any, Dict, List, Optional

import asyncio
from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.sector_snapshot import (
    SnapshotNotFoundError,
    load_snapshot_payload,
    compute_snapshot_metadata,
)
from app.schemas.sector_volume import SectorIn
from app.services.candles_duckdb import get_daily_eod, period_start
from app.services.jobs import JobManager

router = APIRouter()


def _job_manager(request: Request) -> JobManager:
    jobs = getattr(request.app.state, "jobs", None)
    if jobs is None:
        raise HTTPException(status_code=503, detail="Job manager unavailable")
    return jobs


def _use_duckdb_eod(request: Request) -> bool:
    cfg = getattr(request.app.state, "config", {})
    metrics_cfg = cfg.get("metrics", {}) if isinstance(cfg, dict) else {}
    return bool(metrics_cfg.get("use_duckdb_eod"))


@router.post("/tasks/dummy", status_code=status.HTTP_202_ACCEPTED)
async def enqueue_dummy_task(request: Request):
    jobs = _job_manager(request)

    async def _job() -> Optional[str]:
        await asyncio.sleep(0.05)
        return "dummy completed"

    task_id = await jobs.enqueue("dummy", _job)
    return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"task_id": task_id})


@router.post("/tasks/sectors/{sector_id}/patch", status_code=status.HTTP_202_ACCEPTED)
async def enqueue_sector_patch(sector_id: str, request: Request):
    jobs = _job_manager(request)
    task_id = await jobs.enqueue_sector_patch(sector_id)
    return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"task_id": task_id})


@router.get("/tasks/{task_id}")
async def task_status(task_id: str, request: Request) -> Dict[str, Any]:
    jobs = _job_manager(request)
    record = await jobs.get(task_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return record.to_dict()


class TickerMutation(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)


class SectorCreateRequest(BaseModel):
    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    tickers: List[str] = Field(..., min_length=1)


def _apply_rate_headers(response: JSONResponse, headers: Dict[str, str]) -> JSONResponse:
    for header, value in headers.items():
        response.headers[header] = value
    return response


@router.post("/sectors/{sector_id}/tickers", status_code=status.HTTP_202_ACCEPTED)
async def add_sector_ticker(sector_id: str, payload: TickerMutation, request: Request):
    security = request.app.state.security
    client_ip, token_id = security.authorize(request)
    rate_headers = security.check_rate_limit(
        client_ip=client_ip, token_id=token_id, route=f"/sectors/{sector_id}/tickers"
    )

    jobs = _job_manager(request)
    try:
        task_id = await jobs.enqueue_add_ticker(sector_id, payload.symbol)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    response = JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"task_id": task_id})
    return _apply_rate_headers(response, rate_headers)


@router.delete("/sectors/{sector_id}/tickers/{symbol}", status_code=status.HTTP_202_ACCEPTED)
async def remove_sector_ticker(sector_id: str, symbol: str, request: Request):
    security = request.app.state.security
    client_ip, token_id = security.authorize(request)
    rate_headers = security.check_rate_limit(
        client_ip=client_ip, token_id=token_id, route=f"/sectors/{sector_id}/tickers/{symbol}"
    )

    jobs = _job_manager(request)
    task_id = await jobs.enqueue_remove_ticker(sector_id, symbol)
    response = JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"task_id": task_id})
    return _apply_rate_headers(response, rate_headers)


@router.post("/sectors", status_code=status.HTTP_202_ACCEPTED)
async def create_sector(payload: SectorCreateRequest, request: Request):
    security = request.app.state.security
    client_ip, token_id = security.authorize(request)
    rate_headers = security.check_rate_limit(
        client_ip=client_ip, token_id=token_id, route="/sectors"
    )

    jobs = _job_manager(request)
    sanitized_tickers = [
        symbol.strip().upper() for symbol in payload.tickers if symbol and symbol.strip()
    ]
    if not sanitized_tickers:
        raise HTTPException(status_code=400, detail="Tickers list cannot be empty")
    sector = SectorIn(
        id=payload.id.strip().lower(),
        name=payload.name.strip(),
        tickers=sanitized_tickers,
    )

    task_id = await jobs.enqueue_create_sector(sector)
    response = JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"task_id": task_id})
    return _apply_rate_headers(response, rate_headers)


def _to_float(x) -> Optional[float]:
    try:
        v = float(x)
        if isnan(v):
            return None
        return v
    except Exception:
        return None


def _extract_ohlc(records: List[Dict[str, Any]]) -> Dict[str, List[float]]:
    closes, vols = [], []
    for r in records:
        c = _to_float(r.get("Close"))
        v = _to_float(r.get("Volume"))
        if c is not None and v is not None:
            closes.append(c)
            vols.append(v)
    return {"close": closes, "vol": vols}


def _sma(vals: List[float], window: int) -> List[Optional[float]]:
    out, s = [], 0.0
    for i, v in enumerate(vals):
        s += v
        if i >= window:
            s -= vals[i - window]
        out.append(s / window if i >= window - 1 else None)
    return out


@router.get("/healthz")
async def healthz(request: Request):
    provider_kind = (
        request.app.state.config.get("provider", {}).get("kind") or "market_data"
    ).lower()
    return {"status": "ok", "provider": provider_kind}


@router.get("/health")
async def health(request: Request):
    """Liveness/health endpoint (alias of /healthz)."""
    provider_kind = (
        request.app.state.config.get("provider", {}).get("kind") or "market_data"
    ).lower()
    return {"status": "ok", "provider": provider_kind}


@router.get("/health/snapshot")
async def snapshot_health() -> Dict[str, Any]:
    try:
        payload = load_snapshot_payload()
    except SnapshotNotFoundError:
        raise HTTPException(status_code=503, detail="Snapshot unavailable")

    return compute_snapshot_metadata(payload)


@router.get("/price")
async def price(symbol: str, request: Request):
    md = request.app.state.market
    p = await md.get_last_price(symbol)
    return {"symbol": symbol.upper(), "price": p}


@router.get("/debug/market-data")
async def debug_market_data(request: Request) -> Dict[str, Any]:
    """Provider-agnostic diagnostics endpoint."""
    market = getattr(request.app.state, "market", None)
    if market is None:
        raise HTTPException(status_code=503, detail="Market provider unavailable")

    diag_source = getattr(market, "diagnostics", None)
    if callable(diag_source):
        info = diag_source() or {}
    else:
        provider = getattr(market, "inner", market)
        diag_func = getattr(provider, "diagnostics", None)
        if callable(diag_func):
            info = diag_func() or {}
        else:
            provider_name = provider.__class__.__name__ if provider else "unknown"
            info = {"name": provider_name}

    if not isinstance(info, dict):
        info = {"name": str(info)}

    info.setdefault("name", "unknown")
    info.setdefault("request_quota", None)
    info.setdefault("recent_request_ids", [])
    info.setdefault("error_rate", None)
    info.setdefault("base_url", None)

    return info


@router.get("/compass")
async def compass(request: Request):
    md = request.app.state.market
    spy = await md.get_ohlc("SPY", period="6mo", interval="1d")
    series = _extract_ohlc(spy)
    closes = series["close"]
    if len(closes) < 55:
        return {"state": "neutral", "score": 0, "reasons": ["insufficient data"]}

    sma50 = _sma(closes, 50)
    last_close = closes[-1]
    last_sma50 = sma50[-1] or 0.0
    prev_sma50 = sma50[-2] or last_sma50

    trend_score, reasons = 0, []
    if last_close > last_sma50 and last_sma50 >= prev_sma50:
        trend_score = 1
        reasons.append("SPY above rising 50DMA")
    elif last_close < last_sma50 and last_sma50 <= prev_sma50:
        trend_score = -1
        reasons.append("SPY below falling 50DMA")
    else:
        reasons.append("SPY near/flat 50DMA")

    vix = await md.get_vix_term()
    term_score = 0
    if vix and all(k in vix for k in ["^VIX9D", "^VIX", "^VIX3M"]):
        if vix["^VIX9D"] < vix["^VIX"] < vix["^VIX3M"]:
            term_score = 1
            reasons.append("VIX term contango (calm)")
        else:
            term_score = -1
            reasons.append("VIX term flat/backwardation (stress)")
    else:
        reasons.append("VIX term unavailable")

    total = trend_score + term_score
    state = "risk-on" if total > 0 else ("risk-off" if total < 0 else "neutral")
    return {
        "state": state,
        "score": total,
        "components": {"trend": trend_score, "vix_term": term_score},
        "reasons": reasons,
    }


@router.get("/screen")
async def screen(request: Request, symbols: str):
    md = request.app.state.market
    use_duckdb = _use_duckdb_eod(request)
    duckdb_start = period_start("6mo") if use_duckdb else None
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    results: List[Dict[str, Any]] = []
    for s in syms:
        if use_duckdb:
            ohlc = await asyncio.to_thread(get_daily_eod, s, duckdb_start, None)
        else:
            ohlc = await md.get_ohlc(s, period="6mo", interval="1d")
        series = _extract_ohlc(ohlc)
        closes, vols = series["close"], series["vol"]
        n = len(closes)
        if n < 20:
            results.append({"symbol": s, "error": "insufficient data"})
            continue
        sma50 = _sma(closes, 50)
        last_close = closes[-1]
        last_sma50 = sma50[-1] if n >= 50 else None
        pct_above_50 = (last_close - last_sma50) / last_sma50 if last_sma50 else None
        lookback = 20
        prior_high = (
            max(closes[-lookback - 1 : -1]) if n > lookback else max(closes[:-1])
        )
        breakout20 = 1.0 if last_close > prior_high else 0.0
        v20 = sum(vols[-lookback:]) / lookback if n >= lookback else None
        vol_spike = (vols[-1] / v20) if v20 and v20 > 0 else None
        vol_spike_scaled = min(vol_spike, 3.0) / 3.0 if vol_spike is not None else None
        score = 0.0
        if pct_above_50 is not None:
            score += 0.4 * max(pct_above_50, -0.2)
        score += 0.4 * breakout20
        if vol_spike_scaled is not None:
            score += 0.2 * vol_spike_scaled
        results.append(
            {
                "symbol": s,
                "metrics": {
                    "last": last_close,
                    "sma50": last_sma50,
                    "pct_above_50": pct_above_50,
                    "breakout20": bool(breakout20),
                    "vol_spike": vol_spike,
                },
                "score": round(score, 6),
            }
        )
    ranked = sorted(results, key=lambda r: r.get("score", float("-inf")), reverse=True)
    return {"results": ranked}


# Breadth functionality removed - not needed
_INDIVIDUAL_STOCKS_CACHE: Dict[str, Any] = {"df": None, "ts": 0.0, "etag": None}

# Breadth endpoints removed - not needed


def _load_individual_stocks_df():
    """Load individual stocks parquet with caching.
    
    NOTE: This endpoint requires engine/out/individual_stocks.parquet to exist.
    The Makefile target 'make individual-stocks' is currently disabled because
    engine/jobs/ modules don't exist yet. This endpoint will return 404 until
    the data file is generated.
    """
    path = Path("engine/out/individual_stocks.parquet")
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Individual stocks data not found. "
            "The 'make individual-stocks' target is currently disabled. "
            "See Makefile for details.",
        )

    st = path.stat()
    etag = f"{st.st_mtime_ns}-{st.st_size}"
    now = time.time()
    cached = _INDIVIDUAL_STOCKS_CACHE.get("df")
    if (
        cached is not None
        and _INDIVIDUAL_STOCKS_CACHE.get("etag") == etag
        and now - float(_INDIVIDUAL_STOCKS_CACHE.get("ts", 0.0)) < 60.0
    ):
        return cached, etag

    df = pd.read_parquet(path, engine="pyarrow")
    _INDIVIDUAL_STOCKS_CACHE.update({"df": df, "ts": now, "etag": etag})
    return df, etag


@router.get("/individual-stocks/daily")
async def individual_stocks_daily(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    signal: str = Query(
        "up4", description="Signal type: up4, dn4, up10, dn10, up25, dn25"
    ),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum number of results"),
):
    """Get individual stocks for a specific date and signal type."""
    df, etag = _load_individual_stocks_df()

    try:
        target_date = pd.to_datetime(date).date()
    except Exception:
        raise HTTPException(
            status_code=400, detail="Invalid date format. Use YYYY-MM-DD"
        )

    # Filter by date and signal
    date_filter = pd.to_datetime(df["date"]).dt.date == target_date
    signal_filter = df[signal].astype(int) > 0

    filtered_df = df[date_filter & signal_filter]

    if filtered_df.empty:
        return JSONResponse(content=[], headers={"ETag": etag})

    # Select relevant columns and limit results
    result_columns = [
        "symbol",
        "close",
        "daily_return_pct",
        "volume",
        "dollar_volume",
        "up4",
        "dn4",
        "up10",
        "dn10",
        "up25",
        "dn25",
        "up25m",
        "dn25m",
        "up50m",
        "dn50m",
        "up25q",
        "dn25q",
    ]

    result_df = filtered_df[result_columns].head(limit)

    # Convert to list of dicts and handle datetime serialization
    result = result_df.to_dict("records")

    # Convert datetime objects to ISO strings for JSON serialization
    for record in result:
        if "date" in record and pd.notna(record["date"]):
            if hasattr(record["date"], "isoformat"):
                record["date"] = record["date"].isoformat()
            else:
                record["date"] = str(record["date"])

    return JSONResponse(content=result, headers={"ETag": etag})


@router.get("/individual-stocks/symbol")
async def individual_stocks_symbol(
    symbol: str = Query(..., description="Stock symbol"),
    days: int = Query(30, ge=1, le=365, description="Number of recent days"),
):
    """Get individual stock data for a specific symbol."""
    df, etag = _load_individual_stocks_df()

    # Filter by symbol and get recent days
    symbol_df = df[df["symbol"] == symbol.upper()]

    if symbol_df.empty:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")

    # Get recent days
    recent_df = symbol_df.tail(days)

    # Select relevant columns
    result_columns = [
        "date",
        "close",
        "daily_return_pct",
        "volume",
        "dollar_volume",
        "up4",
        "dn4",
        "up10",
        "dn10",
        "up25",
        "dn25",
        "up25m",
        "dn25m",
        "up50m",
        "dn50m",
        "up25q",
        "dn25q",
        "ret_20",
        "ret_from_min34",
        "ret_from_max34",
    ]

    result_df = recent_df[result_columns]

    # Convert to list of dicts and handle datetime serialization
    result = result_df.to_dict("records")

    # Convert datetime objects to ISO strings for JSON serialization
    for record in result:
        if "date" in record and pd.notna(record["date"]):
            if hasattr(record["date"], "isoformat"):
                record["date"] = record["date"].isoformat()
            else:
                record["date"] = str(record["date"])

    return JSONResponse(content=result, headers={"ETag": etag})
