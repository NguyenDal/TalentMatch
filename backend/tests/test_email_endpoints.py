"""Email endpoint checks using an isolated SQLite database and mocked delivery."""

import os
import re
import secrets
from datetime import datetime, timedelta
import unittest
from unittest.mock import AsyncMock, patch

import test_google_auth as auth_tests
from app import main
from app.authentication.sessions import get_current_user_locked
from app.infrastructure.email_delivery import EmailDeliveryError, DELIVERY_ERROR
from app.infrastructure.email_limits import EmailLimiter


class EmailEndpointTests(unittest.TestCase):
    tearDown = auth_tests.GoogleAuthTests.tearDown
    local_user = auth_tests.GoogleAuthTests.local_user

    def setUp(self):
        auth_tests.GoogleAuthTests.setUp(self)
        self.now = 0
        self.limiter = EmailLimiter(clock=lambda: self.now)
        limiter_patch = patch.object(main, "email_limiter", self.limiter)
        limiter_patch.start()
        self.addCleanup(limiter_patch.stop)

    def test_reset_acceptance_keeps_token_and_awaits_delivery(self):
        user_id = self.local_user()
        with patch.object(main, "send_email", new_callable=AsyncMock) as send:
            result = self.client.post("/request-password-reset/", data={"email": "owner@gmail.com"})
        self.assertEqual(result.status_code, 200, result.text)
        send.assert_awaited_once()
        token = re.search(r"http://localhost:3000/reset-password#token=([\w-]+)", send.call_args.kwargs["body"]).group(1)
        with self.sessions() as db:
            stored = db.get(auth_tests.User, user_id).reset_token
        self.assertEqual(stored, auth_tests.User.reset_token_digest(token))
        self.assertNotEqual(stored, token)
        self.assertNotIn(token, result.text)
        self.assertEqual(self.client.post("/verify-password-reset/", data={"token": token}).status_code, 200)
        self.assertEqual(self.client.post("/verify-password-reset/", data={"token": stored}).status_code, 400)

    def test_reset_revokes_old_session_and_consumes_link(self):
        self.local_user()
        with patch.object(main, "geo_lookup", new_callable=AsyncMock, return_value="Unknown"):
            session = self.client.post("/login/", data={"username": "Existing", "password": "old-password"})
        self.assertEqual(session.status_code, 200)
        headers = {"Authorization": "Bearer " + session.json()["access_token"]}
        self.assertEqual(self.client.get("/me/", headers=headers).status_code, 200)
        with patch.object(main, "send_email", new_callable=AsyncMock) as send:
            self.client.post("/request-password-reset/", data={"email": "owner@gmail.com"})
        token = re.search(r"#token=([\w-]+)", send.call_args.kwargs["body"]).group(1)
        self.assertEqual(self.client.post("/reset-password/", data={"token": token, "new_password": "updated-password"}).status_code, 200)
        self.assertEqual(self.client.get("/me/", headers=headers).status_code, 401)
        self.assertEqual(self.client.post("/verify-password-reset/", data={"token": token}).status_code, 400)

    def test_legacy_link_works_until_its_original_expiry(self):
        user_id = self.local_user()
        token = secrets.token_urlsafe(32)
        with self.sessions() as db:
            owner = db.get(auth_tests.User, user_id)
            owner.reset_token = token
            owner.reset_token_expiration = datetime.utcnow() + timedelta(minutes=5)
            db.commit()
        self.assertEqual(self.client.post("/verify-password-reset/", data={"token": token}).status_code, 200)
        with self.sessions() as db:
            db.get(auth_tests.User, user_id).reset_token_expiration = datetime.utcnow() - timedelta(seconds=1)
            db.commit()
        self.assertEqual(self.client.post("/verify-password-reset/", data={"token": token}).status_code, 400)

    def test_reset_delivery_failure_is_503_and_clears_undelivered_token(self):
        user_id = self.local_user()
        with patch.object(main, "send_email", new_callable=AsyncMock, side_effect=EmailDeliveryError(DELIVERY_ERROR)):
            result = self.client.post("/request-password-reset/", data={"email": "owner@gmail.com"})
        self.assertEqual(result.status_code, 503)
        self.assertEqual(result.json(), {"detail": DELIVERY_ERROR})
        with self.sessions() as db:
            self.assertIsNone(db.get(auth_tests.User, user_id).reset_token)

    def test_reset_link_uses_render_origin_when_frontend_override_is_unset(self):
        self.local_user()
        with patch.dict(os.environ, {"FRONTEND_URL": "", "RENDER_EXTERNAL_URL": "https://talentmatch.onrender.com/"}), \
             patch.object(main, "send_email", new_callable=AsyncMock) as send:
            result = self.client.post("/request-password-reset/", data={"email": "owner@gmail.com"})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertIn("https://talentmatch.onrender.com/reset-password#token=", send.call_args.kwargs["body"])

    def test_unknown_email_is_private_and_does_not_send(self):
        with patch.object(main, "send_email", new_callable=AsyncMock) as send:
            result = self.client.post("/request-password-reset/", data={"email": "missing@gmail.com"})
        self.assertEqual(result.status_code, 200)
        self.assertIn("If an account exists", result.json()["message"])
        send.assert_not_awaited()

    def test_reset_throttle_preserves_previous_token(self):
        user_id = self.local_user()
        with patch.object(main, "send_email", new_callable=AsyncMock) as send:
            first = self.client.post("/request-password-reset/", data={"email": "owner@gmail.com"})
            with self.sessions() as db:
                token = db.get(auth_tests.User, user_id).reset_token
            second = self.client.post("/request-password-reset/", data={"email": "owner@gmail.com"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.headers["Retry-After"], "60")
        send.assert_awaited_once()
        with self.sessions() as db:
            self.assertEqual(db.get(auth_tests.User, user_id).reset_token, token)

    def test_unknown_address_gets_same_cooldown_without_using_send_allowance(self):
        with patch.object(main, "send_email", new_callable=AsyncMock) as send:
            first = self.client.post("/request-password-reset/", data={"email": "missing@gmail.com"})
            second = self.client.post("/request-password-reset/", data={"email": "missing@gmail.com"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.headers["Retry-After"], "60")
        self.assertEqual(len(self.limiter.deliveries), 0)
        send.assert_not_awaited()

    def verification_user(self):
        user_id = self.local_user(verified=False)
        # Return a user from the same dependency-injected session as the route.
        def user_dependency(db=main.Depends(main.get_db)):
            return db.get(auth_tests.User, user_id)
        auth_tests.app.dependency_overrides[get_current_user_locked] = user_dependency
        return user_id

    def test_verification_acceptance_awaits_delivery(self):
        user_id = self.verification_user()
        with patch.object(main, "send_email", new_callable=AsyncMock) as send:
            result = self.client.post("/account/send-verification/")
        self.assertEqual(result.status_code, 200, result.text)
        send.assert_awaited_once()
        with self.sessions() as db:
            code = db.get(auth_tests.User, user_id).email_verification_code
        self.assertEqual(len(code), 6)
        self.assertIn(code, send.call_args.kwargs["body"])
        self.assertNotIn(code, result.text)

    def test_verification_failure_does_not_claim_success(self):
        user_id = self.verification_user()
        with patch.object(main, "send_email", new_callable=AsyncMock, side_effect=EmailDeliveryError(DELIVERY_ERROR)):
            result = self.client.post("/account/send-verification/")
        self.assertEqual(result.status_code, 503)
        self.assertEqual(result.json(), {"detail": DELIVERY_ERROR})
        with self.sessions() as db:
            self.assertIsNone(db.get(auth_tests.User, user_id).email_verification_code)

    def test_verification_throttle_preserves_previous_code(self):
        user_id = self.verification_user()
        with patch.object(main, "send_email", new_callable=AsyncMock) as send:
            first = self.client.post("/account/send-verification/")
            with self.sessions() as db:
                code = db.get(auth_tests.User, user_id).email_verification_code
            second = self.client.post("/account/send-verification/")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.headers["Retry-After"], "60")
        send.assert_awaited_once()
        with self.sessions() as db:
            self.assertEqual(db.get(auth_tests.User, user_id).email_verification_code, code)

    def test_failed_send_uses_shared_budget_for_verification_and_unknown_resets(self):
        user_id = self.verification_user()
        self.limiter.per_day = 1
        with patch.object(main, "send_email", new_callable=AsyncMock, side_effect=EmailDeliveryError(DELIVERY_ERROR)) as send:
            first = self.client.post("/request-password-reset/", data={"email": "owner@gmail.com"})
            verification = self.client.post("/account/send-verification/")
            unknown = self.client.post("/request-password-reset/", data={"email": "missing@gmail.com"})
        self.assertEqual(first.status_code, 503)
        self.assertEqual(verification.status_code, 429)
        self.assertEqual(unknown.status_code, 429)
        self.assertEqual(unknown.headers["Retry-After"], "86400")
        send.assert_awaited_once()
        with self.sessions() as db:
            self.assertIsNone(db.get(auth_tests.User, user_id).email_verification_code)


if __name__ == "__main__":
    unittest.main()
