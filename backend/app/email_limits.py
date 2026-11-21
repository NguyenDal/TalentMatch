"""Bounded email abuse controls for a single-worker deployment.

Limits are shared by reset and verification routes and reset on process restart.
They protect the provider allowance but are not a persistent billing cap. Use a
shared, persistent limiter before adding workers or instances.
"""

import hashlib
import math
import os
import time
from collections import deque
from threading import Lock

from fastapi import HTTPException


class EmailLimiter:
    def __init__(self, cooldown=60, per_ip_hour=20, per_hour=20, per_day=100,
                 max_keys=2048, clock=time.monotonic):
        values = (cooldown, per_ip_hour, per_hour, per_day, max_keys)
        if any(value < 1 for value in values):
            raise ValueError("Email limits must be positive.")
        self.cooldown = cooldown
        self.per_ip_hour = per_ip_hour
        self.per_hour = per_hour
        self.per_day = per_day
        self.max_keys = max_keys
        self.clock = clock
        self.recipients = {}
        self.sources = {}
        self.deliveries = deque()
        self.lock = Lock()

    @staticmethod
    def _key(value):
        # Avoid retaining email addresses and IP addresses in limiter state.
        return hashlib.sha256(value.strip().lower().encode("utf-8")).digest()

    @staticmethod
    def _reject(seconds):
        raise HTTPException(
            429, "Too many email requests. Please wait and try again.",
            headers={"Retry-After": str(max(1, math.ceil(seconds)))},
        )

    def _prune(self, now):
        self.recipients = {key: expiry for key, expiry in self.recipients.items() if expiry > now}
        for key, events in list(self.sources.items()):
            while events and events[0] <= now - 3600:
                events.popleft()
            if not events:
                del self.sources[key]
        while self.deliveries and self.deliveries[0] <= now - 86400:
            self.deliveries.popleft()

    def _check_delivery_capacity(self, now):
        retry = 0
        if len(self.deliveries) >= self.per_day:
            retry = self.deliveries[0] + 86400 - now
        recent = [event for event in self.deliveries if event > now - 3600]
        if len(recent) >= self.per_hour:
            retry = max(retry, recent[0] + 3600 - now)
        if retry > 0:
            self._reject(retry)

    def request(self, recipient, source):
        """Rate-limit every valid request, including unknown reset addresses."""
        now = self.clock()
        address_key = self._key(recipient)
        source_key = self._key(source or "unknown")
        with self.lock:
            self._prune(now)
            # Check this before account lookup so exhaustion does not reveal
            # whether the requested address belongs to an existing account.
            self._check_delivery_capacity(now)
            events = self.sources.get(source_key)
            if events is None:
                if len(self.sources) >= self.max_keys:
                    self._reject(min(values[0] for values in self.sources.values()) + 3600 - now)
                events = self.sources[source_key] = deque()
            if len(events) >= self.per_ip_hour:
                self._reject(events[0] + 3600 - now)
            # Repeated cooldown requests count against the IP limit too.
            events.append(now)
            expiry = self.recipients.get(address_key)
            if expiry is not None:
                self._reject(expiry - now)
            if len(self.recipients) >= self.max_keys:
                # Never evict an active limit to admit an attacker-controlled key.
                self._reject(min(self.recipients.values()) - now)
            self.recipients[address_key] = now + self.cooldown

    def reserve_send(self):
        """Reserve an actual delivery attempt; failed sends are not refunded."""
        now = self.clock()
        with self.lock:
            self._prune(now)
            self._check_delivery_capacity(now)
            self.deliveries.append(now)


email_limiter = EmailLimiter(
    cooldown=max(1, int(os.getenv("EMAIL_RECIPIENT_COOLDOWN_SECONDS", "60"))),
    per_ip_hour=max(1, int(os.getenv("EMAIL_REQUESTS_PER_IP_HOUR", "20"))),
    per_hour=max(1, int(os.getenv("EMAIL_SENDS_PER_HOUR", "20"))),
    per_day=max(1, int(os.getenv("EMAIL_SENDS_PER_DAY", "100"))),
    max_keys=max(1, int(os.getenv("EMAIL_LIMITER_MAX_KEYS", "2048"))),
)
