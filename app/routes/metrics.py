from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Mapping, Optional, Set

import numpy as np
import pandas as pd  # type: ignore[import]
from fastapi import APIRouter, Depends, Query, Request, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from pydantic import ValidationError

import duckdb  # type: ignore[import]

from app.schemas.sector_volume import (
    SectorIn,
    SectorVolumeDTO,
    SectorVolumeRequest,
    SectorVolumeResponse,
)
from app.services.candles_duckdb import get_daily_eod, period_start
from app.services import sector_snapshot as sector_snapshot_service
from app.services.sector_snapshot import (
    aggregate_sectors,
    load_latest_metrics_snapshot,
    load_snapshot_payload,
    SnapshotNotFoundError,
    compute_snapshot_metadata,
)

router = APIRouter(prefix="/metrics", tags=["metrics"])
logger = logging.getLogger("market_insights.metrics")


# ---------------- DTOs ----------------
class TrendDTO(BaseModel):
    symbol: str
    as_of: Optional[str]
    price: Optional[float]
    sma10: Optional[float]
    sma20: Optional[float]
    sma50: Optional[float]
    sma200: Optional[float]
    ema9: Optional[float]
    ema21: Optional[float]
    slope10: Optional[float]
    slope20: Optional[float]
    slope50: Optional[float]
    slope200: Optional[float]
    above10: Optional[bool]
    above20: Optional[bool]
    above50: Optional[bool]
    above200: Optional[bool]
    # helpful extra for daily % change on frontend
    prev_close: Optional[float] = None


class MomentumDTO(BaseModel):
    symbol: str
    as_of: Optional[str]
    r5d_pct: Optional[float]
    r1m_pct: Optional[float]
    r3m_pct: Optional[float]


class RsiDTO(BaseModel):
    symbol: str
    as_of: Optional[str]
    rsi: Optional[float]
    state: Optional[str]


class VixDTO(BaseModel):
    as_of: Optional[str]
    value: Optional[float]
    avg7: Optional[float]


class ReturnsDTO(BaseModel):
    MTD: Optional[float] = None
    YTD: Optional[float] = None


class TrendLiteDTO(BaseModel):
    symbol: str
    as_of: Optional[str]
    price: Optional[float]
    prev_close: Optional[float]
    pct_change: Optional[float]
    error: Optional[str] = None
    above10: Optional[bool] = None
    above20: Optional[bool] = None
    above50: Optional[bool] = None
    above200: Optional[bool] = None


class SectorRalphRowDTO(BaseModel):
    rank: int
    symbol: str
    name: str
    pctGainToHigh: Optional[float] = None
    pctOffHigh: Optional[float] = None
    ralphScore: Optional[float] = None
    sectorId: Optional[str] = None
    isBaseline: bool = False
    avgDollarVol10: Optional[float] = None
    sparklineCloses: List[float] = Field(default_factory=list)
    avgDollarVol10: Optional[float] = None


# ---------------- helpers ----------------
def _apply_rate_headers(response: JSONResponse, headers: Mapping[str, str]) -> JSONResponse:
    for header, value in headers.items():
        response.headers[header] = value
    return response


def _close_series_from_ohlc(records: List[Dict]) -> pd.Series:
    if not records:
        return pd.Series(dtype=float)
    df = pd.DataFrame(records)
    # Prefer an index if already present; else use Date column
    if "Date" in df.columns:
        df = df.set_index("Date")
    if hasattr(df.index, "tz"):
        try:
            df.index = df.index.tz_localize(None)
        except Exception:
            pass
    s = df["Close"].astype(float).dropna()
    s = s.sort_index()
    return s


def _sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(window=n, min_periods=n).mean()


def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def _slope_pct_per_day(x: pd.Series, n: int) -> Optional[float]:
    if len(x) < n + n:
        return None
    x_t = x.iloc[-1]
    x_tn = x.iloc[-1 - n]
    if x_tn == 0 or pd.isna(x_t) or pd.isna(x_tn):
        return None
    return float((x_t - x_tn) / x_tn / n)


def _provider(request: Request):
    return request.app.state.market


def _use_duckdb_eod(request: Request) -> bool:
    cfg = getattr(request.app.state, "config", {})
    metrics_cfg = cfg.get("metrics", {}) if isinstance(cfg, dict) else {}
    return bool(metrics_cfg.get("use_duckdb_eod"))


async def _fetch_ohlc(
    request: Request,
    provider,
    symbol: str,
    *,
    period: str,
    interval: str,
) -> List[Dict[str, Any]]:
    if _use_duckdb_eod(request) and interval == "1d":
        start = period_start(period)
        return await asyncio.to_thread(get_daily_eod, symbol, start, None)
    return await provider.get_ohlc(symbol, period=period, interval=interval)


def _snapshot_sectors_from_payload(snapshot_payload: Mapping[str, Any]) -> List[SectorIn]:
    snapshot_sectors = snapshot_payload.get("sectors")
    if not isinstance(snapshot_sectors, list):
        return []
    sector_inputs: List[SectorIn] = []
    for entry in snapshot_sectors:
        if not isinstance(entry, dict):
            continue
        members = entry.get("members")
        if not isinstance(members, list):
            continue
        sector_id = entry.get("id") or entry.get("name")
        sector_name = entry.get("name") or entry.get("id") or "Unknown"
        if not isinstance(sector_id, str):
            continue
        tickers: List[str] = [
            str(symbol).strip().upper()
            for symbol in members
            if isinstance(symbol, str) and symbol.strip()
        ]
        sector_inputs.append(
            SectorIn(id=sector_id, name=str(sector_name), tickers=tickers)
        )
    return sector_inputs


def _sparkline_closes(metric_history: List[Dict[str, Any]], limit: int = 32) -> List[float]:
    closes: List[float] = []
    for entry in metric_history:
        if not isinstance(entry, dict):
            continue
        close = entry.get("close")
        if isinstance(close, (int, float)):
            closes.append(float(close))
    return closes[-limit:]


def _load_metric_from_db(symbol: str):
    if not sector_snapshot_service.SNAPSHOT_DB.exists():
        return None
    try:
        conn = duckdb.connect(str(sector_snapshot_service.SNAPSHOT_DB))
    except duckdb.Error:
        return None
    try:
        return sector_snapshot_service._compute_metric_from_ohlc(conn, symbol)
    except duckdb.Error:
        return None
    finally:
        try:
            conn.close()
        except duckdb.Error:
            pass


async def _compute_trend_lite(request: Request, provider, symbol: str) -> TrendLiteDTO:
    sym = symbol.strip().upper()
    if not sym:
        return TrendLiteDTO(
            symbol=symbol,
            as_of=None,
            price=None,
            prev_close=None,
            pct_change=None,
            error="invalid_symbol",
        )
    try:
        ohlc = await _fetch_ohlc(request, provider, sym, period="1y", interval="1d")
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("trend-lite fetch failed for %s: %s", sym, exc)
        return TrendLiteDTO(
            symbol=sym,
            as_of=None,
            price=None,
            prev_close=None,
            pct_change=None,
            error="fetch_failed",
        )

    series = _close_series_from_ohlc(ohlc)
    if series.empty or len(series) < 1:
        return TrendLiteDTO(
            symbol=sym,
            as_of=None,
            price=None,
            prev_close=None,
            pct_change=None,
            error="no_data",
        )

    price = float(series.iloc[-1])
    prev_close = float(series.iloc[-2]) if len(series) >= 2 else None
    pct_change: Optional[float] = None
    if prev_close and prev_close != 0:
        pct_change = (price / prev_close - 1.0) * 100.0

    as_of_raw = series.index[-1]
    if hasattr(as_of_raw, "date"):
        as_of = as_of_raw.date().isoformat()
    else:
        as_of = str(as_of_raw)

    def _last_sma(window: int) -> Optional[float]:
        if len(series) < window:
            return None
        sm = _sma(series, window)
        if sm.empty:
            return None
        value = sm.iloc[-1]
        if np.isnan(value):
            return None
        return float(value)

    sma10 = _last_sma(10)
    sma20 = _last_sma(20)
    sma50 = _last_sma(50)
    sma200 = _last_sma(200)

    def _above(sma_value: Optional[float]) -> Optional[bool]:
        if sma_value is None:
            return None
        return bool(price > sma_value)

    return TrendLiteDTO(
        symbol=sym,
        as_of=as_of,
        price=price,
        prev_close=prev_close,
        pct_change=pct_change,
        error=None,
        above10=_above(sma10),
        above20=_above(sma20),
        above50=_above(sma50),
        above200=_above(sma200),
    )


# ---------------- endpoints ----------------

# -------- Sector volume snapshot --------


@router.get("/sectors/volume", response_model=SectorVolumeResponse)
async def sectors_volume(request: Request, payload: Optional[str] = Query(None)):
    security = request.app.state.security
    client_ip, token_id = security.authorize(request)
    rate_headers = security.check_rate_limit(
        client_ip=client_ip, token_id=token_id, route="/metrics/sectors/volume"
    )

    try:
        metrics_snapshot, inactive_symbols = load_latest_metrics_snapshot()
    except SnapshotNotFoundError:
        logger.error("No sector volume snapshot available; returning 503")
        return _apply_rate_headers(
            JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"detail": "Sector snapshot unavailable"},
            ),
            rate_headers,
        )

    try:
        snapshot_payload = load_snapshot_payload()
    except SnapshotNotFoundError:
        logger.warning("Latest snapshot payload missing; default response unavailable")
        snapshot_payload = {}

    aggregated: List[SectorVolumeDTO]

    if payload:
        try:
            payload_data = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid payload") from exc
        try:
            request_model = SectorVolumeRequest.model_validate(payload_data)
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail="Invalid sectors payload") from exc
        aggregated = aggregate_sectors(
            request_model.sectors, metrics_snapshot, inactive_symbols
        )
    else:
        sector_inputs = _snapshot_sectors_from_payload(snapshot_payload)
        if not sector_inputs:
            logger.error("Snapshot payload contains no valid sectors; returning 503")
            return _apply_rate_headers(
                JSONResponse(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    content={"detail": "Sector snapshot unavailable"},
                ),
                rate_headers,
            )
        aggregated = aggregate_sectors(sector_inputs, metrics_snapshot, inactive_symbols)

    metadata = compute_snapshot_metadata(snapshot_payload)
    response_payload = dict(metadata)
    response_payload["sectors"] = [item.model_dump() for item in aggregated]
    if not response_payload.get("sectors_count"):
        response_payload["sectors_count"] = len(aggregated)
    if not response_payload.get("members_count"):
        response_payload["members_count"] = sum(len(item.members) for item in aggregated)

    return _apply_rate_headers(JSONResponse(content=response_payload), rate_headers)


@router.post("/sectors/volume")
async def sectors_volume_post_legacy():
    raise HTTPException(
        status_code=410,
        detail="Use GET /metrics/sectors/volume",
    )


@router.get("/sectors/ralph", response_model=List[SectorRalphRowDTO])
async def sectors_ralph(request: Request):
    security = request.app.state.security
    client_ip, token_id = security.authorize(request)
    rate_headers = security.check_rate_limit(
        client_ip=client_ip, token_id=token_id, route="/metrics/sectors/ralph"
    )

    try:
        metrics_snapshot, inactive_symbols = load_latest_metrics_snapshot()
    except SnapshotNotFoundError:
        logger.error("No sector snapshot available for RALPH view; returning 503")
        return _apply_rate_headers(
            JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"detail": "Sector snapshot unavailable"},
            ),
            rate_headers,
        )

    try:
        snapshot_payload = load_snapshot_payload()
    except SnapshotNotFoundError:
        snapshot_payload = {}

    sector_inputs = _snapshot_sectors_from_payload(snapshot_payload)
    if not sector_inputs:
        logger.error("Snapshot payload missing sectors for RALPH view; returning 503")
        return _apply_rate_headers(
            JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"detail": "Sector snapshot unavailable"},
            ),
            rate_headers,
        )

    symbol_map: Dict[str, SectorIn] = {}
    for sector in sector_inputs:
        for member in sector.tickers:
            symbol = member.strip().upper()
            if not symbol or symbol in symbol_map:
                continue
            symbol_map[symbol] = sector

    rows: List[SectorRalphRowDTO] = []
    seen: Set[str] = set()
    for symbol, sector in symbol_map.items():
        if symbol in inactive_symbols:
            continue
        metric = metrics_snapshot.get(symbol)
        if metric is None:
            continue
        rows.append(
            SectorRalphRowDTO(
                rank=0,
                symbol=symbol,
                name=sector.name,
                pctGainToHigh=metric.ytd_gain_to_high_pct,
                pctOffHigh=metric.ytd_off_high_pct,
                ralphScore=metric.ralph_score,
                sectorId=sector.id,
                isBaseline=(symbol == "SPY"),
                avgDollarVol10=metric.avg_dollar_vol10,
                sparklineCloses=_sparkline_closes(metric.history),
            )
        )
        seen.add(symbol)

    baseline_symbol = "SPY"
    if baseline_symbol in seen:
        for row in rows:
            if row.symbol == baseline_symbol:
                row.isBaseline = True
                break
    else:
        baseline_metric = metrics_snapshot.get(baseline_symbol)
        if baseline_metric is None:
            baseline_metric = _load_metric_from_db(baseline_symbol)
        if baseline_metric is not None:
            rows.append(
            SectorRalphRowDTO(
                rank=0,
                symbol=baseline_symbol,
                name="S&P 500",
                pctGainToHigh=baseline_metric.ytd_gain_to_high_pct,
                pctOffHigh=baseline_metric.ytd_off_high_pct,
                ralphScore=baseline_metric.ralph_score,
                sectorId=None,
                isBaseline=True,
                sparklineCloses=_sparkline_closes(baseline_metric.history),
            )
            )

    rows.sort(key=lambda row: (row.ralphScore is None, -(row.ralphScore or 0.0)))
    for index, row in enumerate(rows, start=1):
        row.rank = index

    return _apply_rate_headers(
        JSONResponse(content=[row.model_dump() for row in rows]),
        rate_headers,
    )

@router.get("/trend", response_model=TrendDTO)
async def trend(
    request: Request,
    symbol: str = Query(..., min_length=1),
    provider=Depends(_provider),
):
    # Need ~200 trading days
    ohlc = await _fetch_ohlc(request, provider, symbol, period="2y", interval="1d")
    s = _close_series_from_ohlc(ohlc)
    if s.empty:
        return TrendDTO(
            symbol=symbol.upper(),
            as_of=None,
            price=None,
            sma10=None,
            sma20=None,
            sma50=None,
            sma200=None,
            ema9=None,
            ema21=None,
            slope10=None,
            slope20=None,
            slope50=None,
            slope200=None,
            above10=None,
            above20=None,
            above50=None,
            above200=None,
        )
    sma10 = _sma(s, 10)
    sma20 = _sma(s, 20)
    sma50 = _sma(s, 50)
    sma200 = _sma(s, 200)
    ema9 = _ema(s, 9)
    ema21 = _ema(s, 21)
    price = float(s.iloc[-1])
    prev_close = float(s.iloc[-2]) if len(s) >= 2 else None
    dto = TrendDTO(
        symbol=symbol.upper(),
        as_of=s.index[-1].date().isoformat(),
        price=price,
        prev_close=prev_close,
        sma10=float(sma10.iloc[-1]) if not np.isnan(sma10.iloc[-1]) else None,
        sma20=float(sma20.iloc[-1]) if not np.isnan(sma20.iloc[-1]) else None,
        sma50=float(sma50.iloc[-1]) if not np.isnan(sma50.iloc[-1]) else None,
        sma200=float(sma200.iloc[-1]) if not np.isnan(sma200.iloc[-1]) else None,
        ema9=float(ema9.iloc[-1]) if not np.isnan(ema9.iloc[-1]) else None,
        ema21=float(ema21.iloc[-1]) if not np.isnan(ema21.iloc[-1]) else None,
        slope10=_slope_pct_per_day(sma10, 10),
        slope20=_slope_pct_per_day(sma20, 20),
        slope50=_slope_pct_per_day(sma50, 50),
        slope200=_slope_pct_per_day(sma200, 200),
        above10=bool(
            price
            > (float(sma10.iloc[-1]) if not np.isnan(sma10.iloc[-1]) else float("inf"))
        ),
        above20=bool(
            price
            > (float(sma20.iloc[-1]) if not np.isnan(sma20.iloc[-1]) else float("inf"))
        ),
        above50=bool(
            price
            > (float(sma50.iloc[-1]) if not np.isnan(sma50.iloc[-1]) else float("inf"))
        ),
        above200=bool(
            price
            > (
                float(sma200.iloc[-1])
                if not np.isnan(sma200.iloc[-1])
                else float("inf")
            )
        ),
    )
    return dto


@router.get("/trend/lite", response_model=List[TrendLiteDTO])
async def trend_lite(
    request: Request,
    symbols: str = Query(..., min_length=1),
    provider=Depends(_provider),
):
    raw = [s.strip().upper() for s in symbols.split(",")]
    ordered: List[str] = []
    seen = set()
    for sym in raw:
        if not sym:
            continue
        if sym in seen:
            continue
        seen.add(sym)
        ordered.append(sym)

    if not ordered:
        return []

    semaphore = asyncio.Semaphore(8)

    async def _limited(symbol: str) -> TrendLiteDTO:
        async with semaphore:
            return await _compute_trend_lite(request, provider, symbol)

    results = await asyncio.gather(*(_limited(sym) for sym in ordered))
    return results


@router.get("/momentum", response_model=MomentumDTO)
async def momentum(
    request: Request,
    symbol: str = Query(..., min_length=1),
    provider=Depends(_provider),
):
    ohlc = await _fetch_ohlc(request, provider, symbol, period="12mo", interval="1d")
    s = _close_series_from_ohlc(ohlc)

    def pct(n: int) -> Optional[float]:
        if len(s) <= n:
            return None
        base = s.iloc[-1 - n]
        if base == 0 or pd.isna(base):
            return None
        return float(s.iloc[-1] / base - 1)

    return MomentumDTO(
        symbol=symbol.upper(),
        as_of=s.index[-1].date().isoformat() if not s.empty else None,
        r5d_pct=pct(5),
        r1m_pct=pct(21),
        r3m_pct=pct(63),
    )


@router.get("/rsi", response_model=RsiDTO)
async def rsi(
    request: Request,
    symbol: str = Query(..., min_length=1),
    provider=Depends(_provider),
):
    ohlc = await _fetch_ohlc(request, provider, symbol, period="6mo", interval="1d")
    s = _close_series_from_ohlc(ohlc)
    if s.empty:
        return RsiDTO(symbol=symbol.upper(), as_of=None, rsi=None, state=None)
    delta = s.diff()
    up = delta.clip(lower=0)
    down = -delta.clip(upper=0)
    roll_up = up.ewm(alpha=1 / 14, adjust=False).mean()
    roll_down = down.ewm(alpha=1 / 14, adjust=False).mean()
    rs = roll_up / roll_down.replace(0, np.nan)
    last_rs = rs.iloc[-1]
    if pd.isna(last_rs) or np.isinf(last_rs):
        return RsiDTO(symbol=symbol.upper(), as_of=s.index[-1].date().isoformat(), rsi=None, state=None)
    rsi_val = float(100 - (100 / (1 + last_rs)))
    state = "Neutral"
    if rsi_val > 70:
        state = "Overbought"
    elif rsi_val < 30:
        state = "Oversold"
    return RsiDTO(
        symbol=symbol.upper(),
        as_of=s.index[-1].date().isoformat(),
        rsi=rsi_val,
        state=state,
    )


@router.get("/vix", response_model=VixDTO)
async def vix(provider=Depends(_provider)):
    ohlc = await provider.get_ohlc("^VIX", period="3mo", interval="1d")
    s = _close_series_from_ohlc(ohlc)
    if s.empty:
        return VixDTO(as_of=None, value=None, avg7=None)
    avg7 = float(s.rolling(7).mean().iloc[-1]) if len(s) >= 7 else None
    return VixDTO(
        as_of=s.index[-1].date().isoformat(), value=float(s.iloc[-1]), avg7=avg7
    )


@router.get("/returns", response_model=ReturnsDTO)
async def returns(
    request: Request,
    symbol: str = Query(..., min_length=1),
    windows: str = Query("MTD,YTD"),
    provider=Depends(_provider),
):
    req_windows = [w.strip().upper() for w in windows.split(",") if w.strip()]
    ohlc = await _fetch_ohlc(request, provider, symbol, period="2y", interval="1d")
    s = _close_series_from_ohlc(ohlc)
    out: Dict[str, Optional[float]] = {"MTD": None, "YTD": None}
    if s.empty:
        return ReturnsDTO(**{k: out.get(k) for k in ["MTD", "YTD"]})
    last_date = s.index[-1]
    last_close = float(s.iloc[-1])

    def pct_vs(ref: Optional[float]) -> Optional[float]:
        if ref is None or ref == 0 or pd.isna(ref):
            return None
        return float(last_close / ref - 1)

    if "MTD" in req_windows:
        prev_month_dt = last_date.replace(day=1) - pd.Timedelta(days=1)
        ref = s[
            (s.index.month == prev_month_dt.month)
            & (s.index.year == prev_month_dt.year)
        ]
        mtd_ref = float(ref.iloc[-1]) if len(ref) else None
        out["MTD"] = pct_vs(mtd_ref)

        if "YTD" in req_windows:
            # YTD: last close vs last trading day of prior calendar year
            prev_year = int(last_date.year) - 1
            ref = s[s.index.year == prev_year]
            if len(ref):
                ytd_ref: Optional[float] = float(ref.iloc[-1])
            else:
                cur_year = last_date.year
                start = s[s.index.year == cur_year]
                ytd_ref = float(start.iloc[0]) if len(start) else None
            out["YTD"] = pct_vs(ytd_ref)

    return ReturnsDTO(**{k: out.get(k) for k in ["MTD", "YTD"]})
