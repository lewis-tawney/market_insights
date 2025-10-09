# engine/cache.py
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple


class _InFlight:
    def __init__(self) -> None:
        self.event = asyncio.Event()
        self.result: Any = None
        self.error: Optional[BaseException] = None


class AsyncTTLCache:
    """
    Async TTL cache with:
      - per-key TTL
      - coalesced concurrent fetches
      - optional disk persistence (JSON per key)
    """

    def __init__(self, max_size: int = 4096, persist_dir: Optional[str] = None) -> None:
        self._data: Dict[str, Tuple[float, Any]] = {}  # key -> (expires_at, value)
        self._locks: Dict[str, asyncio.Lock] = {}
        self._inflight: Dict[str, _InFlight] = {}
        self._max_size = max_size
        self._persist_dir = Path(persist_dir) if persist_dir else None
        if self._persist_dir:
            self._persist_dir.mkdir(parents=True, exist_ok=True)
        self._meta_lock = asyncio.Lock()

    def _now(self) -> float:
        return time.time()

    async def _lock_for(self, key: str) -> asyncio.Lock:
        async with self._meta_lock:
            if key not in self._locks:
                self._locks[key] = asyncio.Lock()
            return self._locks[key]

    def _persist_path(self, key: str) -> Optional[Path]:
        if not self._persist_dir:
            return None
        safe = key.replace("/", "_slash_").replace(":", "_colon_")
        return self._persist_dir / f"{safe}.json"

    def _try_load_from_disk(self, key: str) -> Optional[Any]:
        p = self._persist_path(key)
        if not p or not p.exists():
            return None
        try:
            payload = json.loads(p.read_text("utf-8"))
            if float(payload["expires_at"]) > self._now():
                return payload["value"]
            p.unlink(missing_ok=True)
        except Exception:
            pass
        return None

    def _save_to_disk(self, key: str, value: Any, ttl: float) -> None:
        p = self._persist_path(key)
        if not p:
            return
        try:
            p.write_text(
                json.dumps({"expires_at": self._now() + ttl, "value": value}),
                encoding="utf-8",
            )
        except Exception:
            pass

    def _evict_if_needed(self) -> None:
        if len(self._data) <= self._max_size:
            return
        items = sorted(self._data.items(), key=lambda kv: kv[1][0])
        for i in range(len(self._data) - self._max_size):
            self._data.pop(items[i][0], None)

    async def get_or_set(
        self,
        key: str,
        ttl_seconds: float,
        fetcher: Callable[[], Awaitable[Any]],
        persist: bool = False,
    ) -> Any:
        now = self._now()
        hit = self._data.get(key)
        if hit and hit[0] > now:
            return hit[1]

        if persist:
            disk_val = self._try_load_from_disk(key)
            if disk_val is not None:
                self._data[key] = (now + ttl_seconds, disk_val)
                return disk_val

        async with self._meta_lock:
            inflight = self._inflight.get(key)
            if inflight is None:
                inflight = _InFlight()
                self._inflight[key] = inflight

        lock = await self._lock_for(key)
        async with lock:
            now = self._now()
            hit = self._data.get(key)
            if hit and hit[0] > now:
                setter = self._inflight.pop(key, None)
                if setter:
                    setter.result = hit[1]
                    setter.event.set()
                return hit[1]

            try:
                value = await fetcher()
                self._data[key] = (now + ttl_seconds, value)
                self._evict_if_needed()
                if persist:
                    self._save_to_disk(key, value, ttl_seconds)
                setter = self._inflight.pop(key, None)
                if setter:
                    setter.result = value
                    setter.event.set()
                return value
            except BaseException as e:
                setter = self._inflight.pop(key, None)
                if setter:
                    setter.error = e
                    setter.event.set()
                raise

    def purge(self, prefix: Optional[str] = None) -> None:
        if prefix is None:
            self._data.clear()
            return
        for k in list(self._data.keys()):
            if k.startswith(prefix):
                del self._data[k]


class CacheManager:
    def __init__(
        self,
        *,
        quotes_ttl: int = 15,
        ohlc_ttl: int = 180,
        vix_ttl: int = 60,
        computed_ttl: int = 30,
        max_size: int = 4096,
        persist_dir: Optional[str] = None,
        persist_computed: bool = False,
    ) -> None:
        self.quotes = AsyncTTLCache(max_size=max_size, persist_dir=persist_dir)
        self.ohlc = AsyncTTLCache(max_size=max_size, persist_dir=persist_dir)
        self.vix = AsyncTTLCache(max_size=max_size, persist_dir=persist_dir)
        self.computed = AsyncTTLCache(max_size=max_size, persist_dir=persist_dir)

        self.ttl = {
            "quotes": quotes_ttl,
            "ohlc": ohlc_ttl,
            "vix": vix_ttl,
            "computed": computed_ttl,
        }
        self._persist_flags = {
            "quotes": False,
            "ohlc": True,  # persist daily bars helps after restarts
            "vix": False,
            "computed": persist_computed,
        }

        # simple per-namespace hit/miss counters
        self.stats = {
            "quotes": {"hits": 0, "misses": 0},
            "ohlc": {"hits": 0, "misses": 0},
            "vix": {"hits": 0, "misses": 0},
            "computed": {"hits": 0, "misses": 0},
        }

    async def cached_fetch(
        self,
        namespace: str,
        key: str,
        fetcher: Callable[[], Awaitable[Any]],
    ) -> Any:
        cache = getattr(self, namespace)
        ttl = self.ttl[namespace]
        persist_flag = self._persist_flags.get(namespace, False)
        namespaced_key = f"{namespace}:{key}"

        # check if key is already cached and unexpired to track hits/misses
        now = time.time()
        hit = namespaced_key in cache._data and cache._data[namespaced_key][0] > now
        value = await cache.get_or_set(
            namespaced_key, ttl_seconds=ttl, fetcher=fetcher, persist=persist_flag
        )
        ns_stats = self.stats[namespace]
        if hit:
            ns_stats["hits"] += 1
        else:
            ns_stats["misses"] += 1
        return value
