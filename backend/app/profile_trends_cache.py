"""Bounded per-process cache and single-flight calls for profile suggestions."""

import time
from collections import OrderedDict
from concurrent.futures import Future
from copy import deepcopy
from threading import Lock

from fastapi import HTTPException


class ProfileTrendsCache:
    def __init__(self, ttl=900, max_entries=128, max_inflight=2, clock=time.monotonic):
        self.ttl, self.max_entries, self.max_inflight = ttl, max_entries, max_inflight
        self.clock = clock
        self.values = OrderedDict()
        self.pending = {}
        self.lock = Lock()

    def get_or_create(self, key, create):
        with self.lock:
            cached = self.values.get(key)
            if cached and cached[0] > self.clock():
                self.values.move_to_end(key)
                return deepcopy(cached[1])
            self.values.pop(key, None)
            future = self.pending.get(key)
            owner = future is None
            if owner:
                if len(self.pending) >= self.max_inflight:
                    raise HTTPException(429, "Suggestions are busy. Please try again shortly.")
                future = Future()
                self.pending[key] = future
        if not owner:
            # Reuse the ongoing provider call instead of spending credits twice.
            return deepcopy(future.result(timeout=65))
        try:
            result = create()
            with self.lock:
                self.values[key] = (self.clock() + self.ttl, deepcopy(result))
                while len(self.values) > self.max_entries:
                    self.values.popitem(last=False)
            future.set_result(result)
            return deepcopy(result)
        except Exception as exc:
            future.set_exception(exc)
            raise
        finally:
            with self.lock:
                self.pending.pop(key, None)


profile_trends_cache = ProfileTrendsCache()
