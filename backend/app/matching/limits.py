"""Per-process protections for the single-worker free deployment.

These limits reset on a restart and are not a persistent billing cap. Use a
shared limiter before scaling to multiple workers or instances.
"""

import os
import time
from collections import deque
from contextlib import contextmanager
from threading import Lock

from fastapi import HTTPException

MAX_RESUME_BYTES = 5 * 1024 * 1024
MAX_RESUME_CHARACTERS = 40_000
MAX_JOB_CHARACTERS = 30_000
MAX_PDF_PAGES = 25
MAX_PROFILE_PROFESSION_CHARACTERS = 200
MAX_PROFILE_BIO_CHARACTERS = 5_000


class MatchLimiter:
    def __init__(self, per_user=10, total=100, concurrent=2, window=3600, clock=time.monotonic):
        self.per_user, self.total, self.concurrent = per_user, total, concurrent
        self.window, self.clock = window, clock
        self.events = deque()
        self.active = set()
        self.lock = Lock()

    @contextmanager
    def slot(self, user_id):
        now = self.clock()
        with self.lock:
            while self.events and self.events[0][0] <= now - self.window:
                self.events.popleft()
            if user_id in self.active or len(self.active) >= self.concurrent:
                raise HTTPException(429, "A match is already running. Please wait a moment and try again.", headers={"Retry-After": "15"})
            user_count = sum(event[1] == user_id for event in self.events)
            if user_count >= self.per_user or len(self.events) >= self.total:
                raise HTTPException(429, "The matching limit has been reached for this hour. Please try again later.", headers={"Retry-After": "3600"})
            self.active.add(user_id)
            self.events.append((now, user_id))
        try:
            yield
        finally:
            with self.lock:
                self.active.discard(user_id)


match_limiter = MatchLimiter(
    per_user=max(1, int(os.getenv("MATCHES_PER_USER_HOUR", "10"))),
    total=max(1, int(os.getenv("MATCHES_PER_HOUR", "100"))),
    concurrent=max(1, int(os.getenv("MATCH_CONCURRENCY", "2"))),
)

trends_limiter = MatchLimiter(
    per_user=max(1, int(os.getenv("TRENDS_PER_USER_HOUR", "3"))),
    total=max(1, int(os.getenv("TRENDS_PER_HOUR", "20"))),
    concurrent=2,
)
