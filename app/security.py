from __future__ import annotations

import logging
import time
from typing import Dict, Optional, Set, Tuple

from fastapi import HTTPException, Request, status


logger = logging.getLogger("market_insights.security")


class TokenBucket:
    def __init__(self, capacity: float, refill_rate: float) -> None:
        self.capacity = capacity
        self.tokens = capacity
        self.refill_rate = refill_rate
        self.timestamp = time.monotonic()

    def consume(self, amount: float = 1.0) -> Tuple[bool, float]:
        now = time.monotonic()
        elapsed = now - self.timestamp
        self.timestamp = now
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        if self.tokens >= amount:
            self.tokens -= amount
            return True, self.tokens
        needed = amount - self.tokens
        wait_time = needed / self.refill_rate if self.refill_rate > 0 else 1.0
        return False, wait_time


class SecurityManager:
    def __init__(
        self,
        *,
        allowed_ips: Set[str],
        read_api_token: Optional[str],
        rate_limit_per_minute: int = 60,
        burst_size: int = 10,
    ) -> None:
        if not allowed_ips and not read_api_token:
            raise RuntimeError(
                "Security configuration requires ALLOWED_IPS or READ_API_TOKEN"
            )
        self.allowed_ips = {ip.strip() for ip in allowed_ips if ip.strip()}
        self.read_api_token = read_api_token.strip() if read_api_token else None
        self.capacity = float(max(1, burst_size))
        self.refill_rate = rate_limit_per_minute / 60.0
        self.rate_limit_per_minute = rate_limit_per_minute
        self._buckets: Dict[str, TokenBucket] = {}

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
        return "unknown"

    @staticmethod
    def _token_id(token: Optional[str]) -> Optional[str]:
        if not token:
            return None
        if len(token) <= 8:
            return token
        return f"{token[:4]}...{token[-4:]}"

    def authorize(self, request: Request) -> Tuple[str, Optional[str]]:
        client_ip = self._client_ip(request)
        token_id: Optional[str] = None

        if self.allowed_ips:
            if client_ip not in self.allowed_ips:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="IP not allowed",
                )
            return client_ip, None

        if self.read_api_token:
            header = request.headers.get("authorization") or ""
            if not header.startswith("Bearer "):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Missing bearer token",
                )
            supplied = header[len("Bearer ") :].strip()
            if supplied != self.read_api_token:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid bearer token",
                )
            token_id = self._token_id(supplied)
            return client_ip, token_id

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Security configuration missing",
        )

    def check_rate_limit(
        self, *, client_ip: str, token_id: Optional[str], route: str
    ) -> Dict[str, str]:
        bucket = self._buckets.setdefault(
            client_ip, TokenBucket(self.capacity, self.refill_rate)
        )
        allowed, value = bucket.consume()
        if not allowed:
            retry_after = max(1, int(value))
            logger.warning(
                "429 Too Many Requests route=%s ip=%s token=%s",
                route,
                client_ip,
                token_id or "-",
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too Many Requests",
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(self.rate_limit_per_minute),
                    "X-RateLimit-Remaining": "0",
                },
            )
        remaining = int(bucket.tokens)
        return {
            "X-RateLimit-Limit": str(self.rate_limit_per_minute),
            "X-RateLimit-Remaining": str(remaining),
        }
