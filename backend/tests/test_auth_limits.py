"""Bounded authentication budgets with deterministic clocks and local fixtures."""

import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

import test_google_auth as auth_tests
from app.authentication import limits as auth_limits


class AuthLimitTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.limiter = auth_limits.AuthRequestLimiter(limit=2, window=60, clock=lambda: self.now)

    def test_burst_budget_reports_remaining_retry_time(self):
        self.limiter.reserve("source-one")
        self.limiter.reserve("source-one")
        self.now = 10.5
        with self.assertRaises(HTTPException) as caught:
            self.limiter.reserve("source-one")
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(caught.exception.headers, {"Retry-After": "50"})
        self.assertEqual(len(next(iter(self.limiter.sources.values()))), 2)

    def test_rolling_window_releases_expired_requests(self):
        self.limiter.reserve("source-one")
        self.now = 10
        self.limiter.reserve("source-one")
        self.now = 60
        self.limiter.reserve("source-one")
        self.assertEqual(list(next(iter(self.limiter.sources.values()))), [10, 60])

    def test_sources_are_isolated_and_not_stored_as_plaintext(self):
        self.limiter.reserve("source-one")
        self.limiter.reserve("source-one")
        self.limiter.reserve("source-two")
        self.assertEqual(len(self.limiter.sources), 2)
        self.assertNotIn("source-one", repr(self.limiter.sources))
        self.assertNotIn("source-two", repr(self.limiter.sources))

    def test_capacity_never_discards_active_source_budgets(self):
        self.limiter.max_sources = 2
        self.limiter.reserve("one")
        self.limiter.reserve("two")
        original_keys = set(self.limiter.sources)
        with self.assertRaises(HTTPException) as caught:
            self.limiter.reserve("three")
        self.assertEqual(caught.exception.headers["Retry-After"], "60")
        self.assertEqual(set(self.limiter.sources), original_keys)
        self.now = 60
        self.limiter.reserve("three")
        self.assertEqual(len(self.limiter.sources), 1)

    def test_concurrent_reservations_share_one_source_budget(self):
        def reserve(_):
            try:
                self.limiter.reserve("shared-source")
                return True
            except HTTPException:
                return False
        with ThreadPoolExecutor(max_workers=8) as executor:
            outcomes = list(executor.map(reserve, range(12)))
        self.assertEqual(sum(outcomes), 2)


class AuthRouteLimitTests(unittest.TestCase):
    tearDown = auth_tests.GoogleAuthTests.tearDown
    local_user = auth_tests.GoogleAuthTests.local_user

    def setUp(self):
        auth_tests.GoogleAuthTests.setUp(self)
        self.now = 0
        auth_limits.auth_limiter = auth_limits.AuthRequestLimiter(limit=3, window=60, clock=lambda: self.now)

    def test_registration_login_and_google_start_share_a_source_budget(self):
        registration = self.client.post("/register/", data={
            "username": "new_user", "email": "new@example.com", "password": "fixture-password", **auth_tests.AGREEMENT,
        })
        self.assertEqual(registration.status_code, 200)
        with patch("app.main.geo_lookup", AsyncMock(return_value="Test location")):
            login = self.client.post("/login/", data={"username": "new_user", "password": "fixture-password"})
        self.assertEqual(login.status_code, 200)
        google_start = self.client.get("/auth/google/start/", follow_redirects=False)
        self.assertEqual(google_start.status_code, 302)
        blocked = self.client.post("/register/", data={
            "username": "other_user", "email": "other@example.com", "password": "fixture-password", **auth_tests.AGREEMENT,
        })
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.headers["Retry-After"], "60")
        with self.sessions() as db:
            self.assertEqual(db.query(auth_tests.User).count(), 1)
            self.assertEqual(db.query(auth_tests.LoginEvent).count(), 1)
            self.assertEqual(db.query(auth_tests.GoogleAuthFlow).count(), 1)

    def test_verification_submission_shares_budget_and_can_succeed_after_expiry(self):
        user_id = self.local_user(verified=False)
        auth_limits.auth_limiter.limit = 1
        with self.sessions() as db:
            user = db.get(auth_tests.User, user_id)
            user.email_verification_code = "123456"
            user.email_verification_expires_at = datetime.utcnow() + timedelta(minutes=5)
            db.commit()
        with patch("app.main.geo_lookup", AsyncMock(return_value="Test location")):
            login = self.client.post("/login/", data={"username": "Existing", "password": "old-password"})
        self.assertEqual(login.status_code, 200)
        headers = {"Authorization": "Bearer " + login.json()["access_token"]}
        blocked = self.client.post("/account/verify-email/", data={"code": "123456"}, headers=headers)
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.headers["Retry-After"], "60")
        with self.sessions() as db:
            self.assertEqual(db.get(auth_tests.User, user_id).email_verification_code, "123456")
        self.now = 60
        verified = self.client.post("/account/verify-email/", data={"code": "123456"}, headers=headers)
        self.assertEqual(verified.status_code, 200, verified.text)
        self.assertTrue(verified.json()["email_verified"])


if __name__ == "__main__":
    unittest.main()
