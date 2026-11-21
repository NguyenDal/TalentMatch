"""Deterministic quota checks without clocks, networks, or provider credentials."""

import unittest
from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException

from app.infrastructure.email_limits import EmailLimiter


class EmailLimitTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.limiter = EmailLimiter(clock=lambda: self.now)

    def rejected(self, action, retry):
        with self.assertRaises(HTTPException) as result:
            action()
        self.assertEqual(result.exception.status_code, 429)
        self.assertEqual(result.exception.headers, {"Retry-After": str(retry)})

    def test_recipient_cooldown_is_case_insensitive_and_expires(self):
        self.limiter.request("Owner@example.com", "ip-1")
        self.now = 20
        self.rejected(lambda: self.limiter.request("owner@example.com", "ip-2"), 40)
        self.now = 60
        self.limiter.request("owner@example.com", "ip-2")
        self.assertNotIn("owner@example.com", repr(self.limiter.recipients))

    def test_ip_budget_covers_unknown_addresses_and_cooldown_retries(self):
        self.limiter.per_ip_hour = 2
        self.limiter.request("unknown@example.com", "ip-1")
        self.rejected(lambda: self.limiter.request("unknown@example.com", "ip-1"), 60)
        self.rejected(lambda: self.limiter.request("different@example.com", "ip-1"), 3600)
        self.assertEqual(len(self.limiter.deliveries), 0)
        self.now = 3600
        self.limiter.request("different@example.com", "ip-1")

    def test_hour_and_day_budgets_have_rolling_expiry(self):
        self.limiter.per_hour = 2
        self.limiter.per_day = 3
        self.limiter.reserve_send()
        self.limiter.reserve_send()
        self.rejected(self.limiter.reserve_send, 3600)
        self.now = 3600
        self.limiter.reserve_send()
        self.rejected(self.limiter.reserve_send, 82800)
        # Unknown addresses get the same rejection before account lookup.
        self.rejected(lambda: self.limiter.request("missing@example.com", "ip-1"), 82800)
        self.now = 86400
        self.limiter.reserve_send()
        self.assertEqual(len(self.limiter.deliveries), 2)

    def test_key_capacity_rejects_new_keys_without_erasing_active_limits(self):
        limiter = EmailLimiter(max_keys=2, clock=lambda: self.now)
        limiter.request("one@example.com", "ip-1")
        limiter.request("two@example.com", "ip-2")
        self.rejected(lambda: limiter.request("three@example.com", "ip-3"), 3600)
        self.rejected(lambda: limiter.request("three@example.com", "ip-1"), 60)
        self.assertEqual(len(limiter.recipients), 2)
        self.assertEqual(len(limiter.sources), 2)
        self.now = 3600
        limiter.request("three@example.com", "ip-3")
        self.assertEqual(len(limiter.sources), 1)
        self.assertEqual(len(limiter.recipients), 1)

    def test_concurrent_delivery_reservations_cannot_overspend_budget(self):
        self.limiter.per_day = 3
        def reserve(_):
            try:
                self.limiter.reserve_send()
                return True
            except HTTPException:
                return False
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(reserve, range(20)))
        self.assertEqual(sum(results), 3)
        self.assertEqual(len(self.limiter.deliveries), 3)


if __name__ == "__main__":
    unittest.main()
