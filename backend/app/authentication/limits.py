"""Bounded, per-source authentication budgets for a single-worker deployment.

The rolling budget is shared by password login, registration, Google start,
and email verification-code submissions.
It never locks a username or account. State resets on restart; use a shared
limiter before running multiple workers or instances.
"""

import hashlib
import math
import os
import time
from collections import deque
from threading import Lock

from fastapi import HTTPException, Request


class AuthRequestLimiter:
    def __init__(self, limit=60, window=600, max_sources=2048, clock=time.monotonic):
        if any(value < 1 for value in (limit, window, max_sources)):
            raise ValueError("Authentication limits must be positive.")
        self.limit = limit
        self.window = window
        self.max_sources = max_sources
        self.clock = clock
        self.sources = {}
        self.lock = Lock()

    @staticmethod
    def reject(seconds):
        raise HTTPException(429, "Too many account requests. Please wait and try again.",
                            headers={"Retry-After": str(max(1, math.ceil(seconds)))})

    def reserve(self, source):
        key = hashlib.sha256((source or "unknown").encode("utf-8")).digest()
        with self.lock:
            now = self.clock()
            for stored_key, events in list(self.sources.items()):
                while events and events[0] <= now - self.window:
                    events.popleft()
                if not events:
                    del self.sources[stored_key]
            events = self.sources.get(key)
            if events is None:
                if len(self.sources) >= self.max_sources:
                    # Keep active counters instead of making space by erasing
                    # another source's budget. Expired entries are pruned above.
                    self.reject(min(values[0] for values in self.sources.values()) + self.window - now)
                events = self.sources[key] = deque()
            if len(events) >= self.limit:
                self.reject(events[0] + self.window - now)
            events.append(now)


auth_limiter = AuthRequestLimiter(
    limit=max(1, int(os.getenv("AUTH_REQUESTS_PER_SOURCE", "60"))),
    window=max(1, int(os.getenv("AUTH_RATE_WINDOW_SECONDS", "600"))),
    max_sources=max(1, int(os.getenv("AUTH_LIMITER_MAX_SOURCES", "2048"))),
)


def require_auth_rate_limit(request: Request):
    # Uvicorn must resolve forwarding headers only from trusted platform proxies.
    auth_limiter.reserve(request.client.host if request.client else None)
