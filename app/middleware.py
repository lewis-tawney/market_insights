# app/middleware.py
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Dict

from fastapi import Request
from fastapi.responses import JSONResponse


class RateLimiter:
    """Simple in-memory rate limiter."""

    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.requests: Dict[str, deque] = defaultdict(deque)

    def is_allowed(self, client_ip: str) -> bool:
        """Check if request is allowed for the given client IP."""
        now = time.time()
        minute_ago = now - 60

        # Clean old requests
        client_requests = self.requests[client_ip]
        while client_requests and client_requests[0] < minute_ago:
            client_requests.popleft()

        # Check if under limit
        if len(client_requests) >= self.requests_per_minute:
            return False

        # Add current request
        client_requests.append(now)
        return True


# Global rate limiter instance
rate_limiter = RateLimiter()


async def rate_limit_middleware(request: Request, call_next):
    """Rate limiting middleware."""
    client_ip = request.client.host if request.client else "unknown"

    if not rate_limiter.is_allowed(client_ip):
        return JSONResponse(
            status_code=429,
            content={
                "error": "Rate limit exceeded",
                "message": "Too many requests. Please try again later.",
                "retry_after": 60,
            },
        )

    response = await call_next(request)
    return response
