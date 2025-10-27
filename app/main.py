# app/main.py
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Set, cast

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import load_config
from app.logging_config import setup_logging
from app.middleware import rate_limit_middleware, rate_limiter
from app.providers.yfinance import YFinanceProvider
from app.routes.api import router as api_router
from app.routes.metrics import router as metrics_router
from engine.cache import CacheManager
from engine.providers.base import MarketData
from app.security import SecurityManager


class CachedProvider:
    def __init__(self, inner: MarketData, cache: CacheManager) -> None:
        self.inner = inner
        self.cache = cache

    async def get_ohlc(
        self, symbol: str, *, period: str = "6mo", interval: str = "1d"
    ) -> List[Dict[str, Any]]:
        key = f"{symbol}:{period}:{interval}"

        async def fetch() -> List[Dict[str, Any]]:
            return await self.inner.get_ohlc(
                symbol,
                period=period,
                interval=interval,
            )

        return cast(
            List[Dict[str, Any]],
            await self.cache.cached_fetch("ohlc", key, fetch),
        )

    async def get_last_price(self, symbol: str) -> Optional[float]:
        async def fetch() -> Optional[float]:
            return await self.inner.get_last_price(symbol)

        return cast(
            Optional[float],
            await self.cache.cached_fetch("quotes", symbol, fetch),
        )

    async def get_vix_term(self) -> Optional[Dict[str, float]]:
        async def fetch() -> Optional[Dict[str, float]]:
            return await self.inner.get_vix_term()

        return cast(
            Optional[Dict[str, float]],
            await self.cache.cached_fetch("vix", "^VIX", fetch),
        )


def _parse_allowed_ips(raw: Any) -> Set[str]:
    ips: Set[str] = set()
    if isinstance(raw, str):
        items = [raw]
    elif isinstance(raw, (list, tuple, set)):
        items = [item for item in raw if isinstance(item, str)]
    else:
        items = []

    for item in items:
        normalized = item.replace(";", ",")
        for fragment in normalized.split(","):
            for token in fragment.split():
                token_clean = token.strip()
                if token_clean:
                    ips.add(token_clean)
    return ips


def _make_provider(cfg: Dict[str, Any]) -> CachedProvider:
    cache_cfg = cfg.get("cache", {})
    ttl = cache_cfg.get("ttl", {})
    cache = CacheManager(
        quotes_ttl=int(ttl.get("quotes", 15)),
        ohlc_ttl=int(ttl.get("ohlc", 180)),
        vix_ttl=int(ttl.get("vix", 60)),
        computed_ttl=int(ttl.get("computed", 30)),
        max_size=int(cache_cfg.get("max_size", 4096)),
        persist_dir=cache_cfg.get("persist_dir") or None,
        persist_computed=bool(cache_cfg.get("persist_computed", False)),
    )
    # Currently only YFinanceProvider is supported in this repo
    inner = YFinanceProvider()

    return CachedProvider(inner, cache)


cfg: Dict[str, Any] = load_config()
setup_logging(cfg)
logger = logging.getLogger("market_insights")

app = FastAPI(
    title="Market Insights API",
    description="Financial market analysis and stock screening API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Security configuration
security_cfg = cfg.get("security", {})
frontend_origin_cfg = security_cfg.get("frontend_origin")
frontend_origins: List[str] = []
if isinstance(frontend_origin_cfg, str):
    frontend_origins = [
        origin.strip()
        for origin in frontend_origin_cfg.split(",")
        if origin.strip()
    ]
elif isinstance(frontend_origin_cfg, (list, tuple, set)):
    for origin in frontend_origin_cfg:
        if isinstance(origin, str):
            trimmed = origin.strip()
            if trimmed:
                frontend_origins.append(trimmed)

if not frontend_origins:
    frontend_origins = ["http://localhost:5173"]

allowed_ips = _parse_allowed_ips(security_cfg.get("allowed_ips"))
read_api_token = security_cfg.get("read_api_token") or None

try:
    security_manager = SecurityManager(
        allowed_ips=allowed_ips,
        read_api_token=read_api_token,
    )
except RuntimeError as exc:
    logger.error("Security misconfiguration: %s", exc)
    raise

app.state.security = security_manager

# Add CORS middleware restricted to configured origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure rate limiting
rate_limit_config = cfg.get("rate_limit", {})
requests_per_minute = rate_limit_config.get("requests_per_minute", 60)

rate_limiter.requests_per_minute = requests_per_minute

# Add rate limiting middleware
app.middleware("http")(rate_limit_middleware)

# Bind shared objects on app.state
app.state.config = cfg
app.state.market = _make_provider(cfg)
app.state.cache = app.state.market.cache

logger.info("Market Insights API starting up...")

# Routes
app.include_router(api_router)
app.include_router(metrics_router)
# Chart routes removed - frontend uses /stock/{symbol} endpoint instead


@app.on_event("startup")
async def startup_event():
    """Log startup information."""
    logger.info("Market Insights API started successfully")
    logger.info(f"Rate limit: {requests_per_minute} requests per minute")
    logger.info("API documentation available at /docs")


def _to_float(value: Any, fallback: float | None = None) -> float | None:
    try:
        if value is None:
            return fallback
        return float(value)
    except Exception:
        return fallback


@app.get("/stock/{symbol}")
@app.get("/api/stock/{symbol}")
async def get_stock_data(
    symbol: str, period: str = "1mo", interval: str = "1d"
) -> List[Dict[str, Any]]:
    """Return OHLCV data for a symbol using the configured provider."""
    sym = symbol.strip().upper()
    if not sym:
        raise HTTPException(status_code=400, detail="Symbol is required")

    provider = app.state.market
    try:
        raw = await provider.get_ohlc(sym, period=period, interval=interval)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("Failed to fetch OHLC for %s", sym)
        raise HTTPException(
            status_code=500, detail="Failed to fetch stock data"
        ) from exc

    if not raw:
        return []

    normalized: List[Dict[str, Any]] = []
    for row in raw:
        dt = row.get("Date") or row.get("date") or row.get("time")
        try:
            iso_time = dt.isoformat() if hasattr(dt, "isoformat") else str(dt)
        except Exception:
            iso_time = str(dt)

        normalized.append(
            {
                "time": iso_time,
                "open": _to_float(row.get("Open") or row.get("open")),
                "high": _to_float(row.get("High") or row.get("high")),
                "low": _to_float(row.get("Low") or row.get("low")),
                "close": _to_float(row.get("Close") or row.get("close")),
                "volume": _to_float(
                    row.get("Volume") or row.get("volume"), fallback=0.0
                ),
            }
        )

    return [
        r
        for r in normalized
        if None not in (r["open"], r["high"], r["low"], r["close"])
    ]


# Debug endpoint for cache stats
@app.get("/debug/cache")
async def cache_stats():
    c = app.state.cache

    def ns_count(namespace: str) -> int:
        prefix = f"{namespace}:"
        cache_ns = getattr(c, namespace)
        return sum(1 for key in cache_ns._data.keys() if key.startswith(prefix))

    return {
        "stats": getattr(c, "stats", {}),
        "sizes": {
            "quotes": ns_count("quotes"),
            "ohlc": ns_count("ohlc"),
            "vix": ns_count("vix"),
            "computed": ns_count("computed"),
        },
        "ttls": c.ttl,
    }
