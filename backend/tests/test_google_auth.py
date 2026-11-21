"""Isolated authentication tests: no .env reads, external API calls, or live DB.

Run from backend: python -B -m unittest discover -s tests -v
"""

import json
import os
import re
import time
import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlsplit

TEST_ENV = {
    "DATABASE_URL": "sqlite://", "SECRET_KEY": "isolated-test-secret-" * 4,
    "GOOGLE_CLIENT_ID": "test-client.apps.googleusercontent.com", "GOOGLE_CLIENT_SECRET": "test-secret",
    "GOOGLE_REDIRECT_URI": "http://localhost:8000/auth/google/callback/", "FRONTEND_URL": "http://localhost:3000",
    "OPENAI_API_KEY": "test-not-a-real-key", "MAIL_USERNAME": "test@example.com", "MAIL_PASSWORD": "test", "MAIL_FROM": "test@example.com",
    "MAIL_SERVER": "smtp.example.com", "AWS_EC2_METADATA_DISABLED": "true",
    "AWS_ACCESS_KEY_ID": "test", "AWS_SECRET_ACCESS_KEY": "test", "PYTHON_DOTENV_DISABLED": "1",
}

# Prevent importing the application from reading developer credentials.
with patch.dict(os.environ, TEST_ENV), patch("dotenv.load_dotenv", return_value=False):
    from fastapi.testclient import TestClient
    from jose import jwt
    from sqlalchemy import create_engine
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.main import app
    from app.authentication.passwords import hash_password, verify_password
    from app.infrastructure.database import Base, get_db
    from app.models import GoogleAuthFlow, GoogleAuthTicket, GoogleIdentity, LoginEvent, User, UserSession
    from app.authentication import google as google_auth
    from app.authentication import limits as auth_limits

ORIGIN = {"Origin": TEST_ENV["FRONTEND_URL"]}


def popup_payload(response):
    match = re.search(r"postMessage\((.*), \"http://localhost:3000\"\)", response.text)
    assert match, response.text
    return json.loads(match.group(1))


class GoogleAuthTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, TEST_ENV)
        self.environment.start()
        limiter = patch.object(auth_limits, "auth_limiter", auth_limits.AuthRequestLimiter())
        limiter.start()
        self.addCleanup(limiter.stop)
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        def override_db():
            with self.sessions() as db:
                yield db
        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.engine.dispose()
        self.environment.stop()

    def local_user(self, username="Existing", email="owner@gmail.com", verified=True, password="old-password"):
        with self.sessions() as db:
            user = User(username=username, email=email, email_verified=verified,
                        hashed_password=hash_password(password) if password else None)
            db.add(user)
            db.commit()
            return user.id

    def begin(self, remember=False):
        response = self.client.get("/auth/google/start/", params={"remember": str(remember).lower()}, follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        params = parse_qs(urlsplit(response.headers["location"]).query)
        self.assertEqual(params["scope"], ["openid email"])
        self.assertEqual(params["code_challenge_method"], ["S256"])
        self.assertIn("HttpOnly", response.headers["set-cookie"])
        self.assertIn("SameSite=lax", response.headers["set-cookie"])
        return params

    def oauth(self, email="owner@gmail.com", subject="google-subject-1", authoritative=True, remember=False):
        params = self.begin(remember)
        identity = {"email": email, "subject": subject, "authoritative": authoritative}
        with patch.object(google_auth, "exchange_code", AsyncMock(return_value="signed-token")), \
             patch.object(google_auth, "verify_google_identity", return_value=identity):
            response = self.client.get("/auth/google/callback/", params={"state": params["state"][0], "code": "code"})
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertIn("default-src 'none'", response.headers["content-security-policy"])
        return popup_payload(response)

    def complete_signup(self, username="new_user", **kwargs):
        pending = self.oauth(**kwargs)
        self.assertEqual(pending["status"], "signup_required")
        response = self.client.post("/auth/google/signup/", json={"ticket": pending["ticket"], "username": username}, headers=ORIGIN)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_google_signup_passwordless_private_and_regular_login_after_password_setup(self):
        auth = self.complete_signup(remember=True)
        self.assertTrue(auth["remember"])
        headers = {"Authorization": f"Bearer {auth['access_token']}"}
        me = self.client.get("/me/", headers=headers).json()
        self.assertFalse(me["has_password"])
        self.assertTrue(me["google_linked"])
        self.assertNotIn("first_name", me)
        self.assertNotIn("last_name", User.__table__.columns)
        self.assertNotIn("full_name", me)
        with self.sessions() as db:
            self.assertIsNone(db.get(User, auth["user_id"]).hashed_password)
            self.assertEqual(db.query(LoginEvent).count(), 1)
        self.assertEqual(self.client.post("/account/set-password/", data={"new_password": "new-password"}).status_code, 401)
        self.assertEqual(self.client.post("/account/set-password/", data={"new_password": "short"}, headers=headers).status_code, 400)
        response = self.client.post("/account/set-password/", data={"new_password": "new-password"}, headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.post("/account/set-password/", data={"new_password": "overwritten-password"}, headers=headers).status_code, 409)
        with patch("app.main.geo_lookup", AsyncMock(return_value="Test location")):
            response = self.client.post("/login/", data={"username": "NEW_USER", "password": "new-password"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(self.client.get("/me/", headers=headers).json()["has_password"])

    def test_unique_usernames_and_submission_recheck(self):
        self.local_user(username="Taken")
        for name in ("TAKEN", " taken "):
            status = self.client.get("/auth/username-availability/", params={"username": name}).json()
            self.assertTrue(status["valid"])
            self.assertFalse(status["available"])
        self.assertFalse(self.client.get("/auth/username-availability/", params={"username": "a!"}).json()["valid"])
        self.assertTrue(self.client.get("/auth/username-availability/", params={"username": "available_1"}).json()["available"])
        pending = self.oauth(email="new@gmail.com")
        response = self.client.post("/auth/google/signup/", json={"ticket": pending["ticket"], "username": "TAKEN"}, headers=ORIGIN)
        self.assertEqual(response.status_code, 409)
        with self.sessions() as db:
            self.assertEqual(db.query(User).count(), 1)
            self.assertEqual(db.query(GoogleIdentity).count(), 0)
            db.add(User(username="TaKeN", email="second@gmail.com", hashed_password=None))
            with self.assertRaises(IntegrityError):
                db.commit()
            db.rollback()
        response = self.client.post("/auth/google/signup/", json={"ticket": pending["ticket"], "username": "other_user"}, headers=ORIGIN)
        self.assertEqual(response.status_code, 200)

    def test_normal_signup_only_username_email_password_and_unique_email(self):
        response = self.client.post("/register/", data={"username": "standard", "email": "Owner@Gmail.com", "password": "new-password"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(set(response.json()), {"id", "username", "email"})
        response = self.client.post("/register/", data={"username": "other", "email": "owner@gmail.com", "password": "new-password"})
        self.assertEqual(response.status_code, 409)

    def test_existing_account_requires_consent_cancel_changes_nothing(self):
        user_id = self.local_user()
        pending = self.oauth()
        self.assertEqual(pending["status"], "link_required")
        self.assertFalse(pending["requires_password"])
        with self.sessions() as db:
            self.assertEqual(db.query(GoogleIdentity).count(), 0)
        response = self.client.post("/auth/google/cancel/", json={"ticket": pending["ticket"]}, headers=ORIGIN)
        self.assertEqual(response.status_code, 200)
        with self.sessions() as db:
            self.assertTrue(verify_password("old-password", db.get(User, user_id).hashed_password))
            self.assertEqual(db.query(GoogleIdentity).count(), 0)

    def test_verified_link_retains_password_and_subject_controls_returning_login(self):
        user_id = self.local_user()
        pending = self.oauth()
        response = self.client.post("/auth/google/link/", json={"ticket": pending["ticket"], "confirm": True}, headers=ORIGIN)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["user_id"], user_id)
        with self.sessions() as db:
            self.assertTrue(verify_password("old-password", db.get(User, user_id).hashed_password))
        result = self.oauth(email="changed-google-email@gmail.com")
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["auth"]["user_id"], user_id)
        conflict = self.oauth(subject="another-google-subject")
        self.assertEqual(conflict["status"], "error")

    def test_unverified_account_claim_invalidates_preregistered_credentials(self):
        user_id = self.local_user(verified=False)
        with patch("app.main.geo_lookup", AsyncMock(return_value="Test location")):
            old_auth = self.client.post("/login/", data={"username": "Existing", "password": "old-password"}).json()
        with self.sessions() as db:
            user = db.get(User, user_id)
            user.generate_reset_token()
            db.add(UserSession(user_id=user_id, session_id="legacy-session"))
            db.commit()
        pending = self.oauth()
        self.assertTrue(pending["replaces_unverified_password"])
        response = self.client.post("/auth/google/link/", json={"ticket": pending["ticket"], "confirm": True}, headers=ORIGIN)
        self.assertEqual(response.status_code, 200, response.text)
        with self.sessions() as db:
            user = db.get(User, user_id)
            self.assertIsNone(user.hashed_password)
            self.assertIsNone(user.reset_token)
            self.assertTrue(user.email_verified)
            self.assertTrue(db.query(UserSession).one().revoked)
            self.assertEqual(db.query(LoginEvent).filter(LoginEvent.active.is_(True)).count(), 1)
        self.assertEqual(self.client.get("/me/", headers={"Authorization": f"Bearer {old_auth['access_token']}"}).status_code, 401)

    def test_third_party_email_requires_password_and_limits_attempts(self):
        self.local_user(email="owner@example.com")
        pending = self.oauth(email="owner@example.com", authoritative=False)
        self.assertTrue(pending["requires_password"])
        for _ in range(5):
            self.assertEqual(self.client.post("/auth/google/link/", json={"ticket": pending["ticket"], "confirm": True, "password": "wrong"}, headers=ORIGIN).status_code, 400)
        response = self.client.post("/auth/google/link/", json={"ticket": pending["ticket"], "confirm": True, "password": "old-password"}, headers=ORIGIN)
        self.assertEqual(response.status_code, 400)
        pending = self.oauth(email="owner@example.com", authoritative=False)
        response = self.client.post("/auth/google/link/", json={"ticket": pending["ticket"], "confirm": True, "password": "old-password"}, headers=ORIGIN)
        self.assertEqual(response.status_code, 200, response.text)

    def test_ticket_binding_origin_expiry_and_replay(self):
        pending = self.oauth()
        body = {"ticket": pending["ticket"], "username": "new_user"}
        self.assertEqual(self.client.post("/auth/google/signup/", json=body, headers={"Origin": "https://attacker.example"}).status_code, 403)
        with TestClient(app) as other_browser:
            self.assertEqual(other_browser.post("/auth/google/signup/", json=body, headers=ORIGIN).status_code, 400)
        self.assertEqual(self.client.post("/auth/google/signup/", json=body, headers=ORIGIN).status_code, 200)
        self.assertEqual(self.client.post("/auth/google/signup/", json=body, headers=ORIGIN).status_code, 400)
        pending = self.oauth(email="second@gmail.com", subject="second")
        with self.sessions() as db:
            db.query(GoogleAuthTicket).filter_by(token_hash=google_auth.digest(pending["ticket"])).one().expires_at = datetime.utcnow() - timedelta(seconds=1)
            db.commit()
        self.assertEqual(self.client.post("/auth/google/signup/", json={"ticket": pending["ticket"], "username": "second"}, headers=ORIGIN).status_code, 400)

    def test_stale_link_cannot_bind_after_password_change(self):
        user_id = self.local_user()
        pending = self.oauth()
        with self.sessions() as db:
            db.get(User, user_id).hashed_password = hash_password("changed-password")
            db.commit()
        self.assertEqual(self.client.post("/auth/google/link/", json={"ticket": pending["ticket"], "confirm": True}, headers=ORIGIN).status_code, 409)

    def test_state_binding_and_one_time_callback(self):
        params = self.begin()
        with patch.object(google_auth, "exchange_code", AsyncMock(return_value="token")) as exchange:
            with TestClient(app) as other_browser:
                result = popup_payload(other_browser.get("/auth/google/callback/", params={"state": params["state"][0], "code": "code"}))
                self.assertEqual(result["status"], "error")
            exchange.assert_not_called()
            response = self.client.get("/auth/google/callback/", params={"state": params["state"][0], "error": "access_denied"})
            self.assertEqual(popup_payload(response)["status"], "error")
            response = self.client.get("/auth/google/callback/", params={"state": params["state"][0], "code": "code"})
            self.assertEqual(popup_payload(response)["status"], "error")
            exchange.assert_not_called()
        with self.sessions() as db:
            flow = db.query(GoogleAuthFlow).one()
            self.assertIsNotNone(flow.consumed_at)
            self.assertEqual(flow.code_verifier, "")

    def test_session_requires_registered_sid_and_rejects_revoked_session(self):
        auth = self.complete_signup()
        claims = jwt.decode(auth["access_token"], TEST_ENV["SECRET_KEY"], algorithms=["HS256"])
        claims.pop("sid")
        forged_legacy = jwt.encode(claims, TEST_ENV["SECRET_KEY"], algorithm="HS256")
        self.assertEqual(self.client.get("/me/", headers={"Authorization": f"Bearer {forged_legacy}"}).status_code, 401)
        with self.sessions() as db:
            db.query(LoginEvent).update({"active": False})
            db.commit()
        self.assertEqual(self.client.get("/me/", headers={"Authorization": f"Bearer {auth['access_token']}"}).status_code, 401)

    def test_delayed_password_login_cannot_create_session_after_google_reclaim(self):
        user_id = self.local_user(verified=False)
        async def reclaim_during_location_lookup(_ip):
            # Simulate the completed reclaim transaction while GeoIP was pending.
            with self.sessions() as db:
                user = db.get(User, user_id)
                user.hashed_password = None
                user.email_verified = True
                db.add(GoogleIdentity(user_id=user_id, subject="reclaimed-subject"))
                db.commit()
            return "Test location"
        with patch("app.main.geo_lookup", side_effect=reclaim_during_location_lookup):
            response = self.client.post("/login/", data={"username": "Existing", "password": "old-password"})
        self.assertEqual(response.status_code, 401)
        with self.sessions() as db:
            self.assertEqual(db.query(LoginEvent).count(), 0)

    def test_revoked_preregistrant_session_cannot_set_password_after_reclaim(self):
        user_id = self.local_user(verified=False)
        with patch("app.main.geo_lookup", AsyncMock(return_value="Test location")):
            old_auth = self.client.post("/login/", data={"username": "Existing", "password": "old-password"}).json()
        pending = self.oauth()
        response = self.client.post("/auth/google/link/", json={"ticket": pending["ticket"], "confirm": True}, headers=ORIGIN)
        self.assertEqual(response.status_code, 200)
        stale_headers = {"Authorization": f"Bearer {old_auth['access_token']}"}
        self.assertEqual(self.client.post("/account/set-password/", data={"new_password": "attacker-password"}, headers=stale_headers).status_code, 401)
        self.assertEqual(self.client.patch("/account/update/", data={"email": "attacker@example.com"}, headers=stale_headers).status_code, 401)
        with self.sessions() as db:
            user = db.get(User, user_id)
            self.assertIsNone(user.hashed_password)
            self.assertEqual(user.email, "owner@gmail.com")

    def test_cross_site_cookie_requires_https(self):
        with patch.dict(os.environ, {"GOOGLE_COOKIE_SAMESITE": "none"}):
            with self.assertRaises(RuntimeError):
                google_auth.cookie_same_site()
            with patch.dict(os.environ, {"GOOGLE_REDIRECT_URI": "https://api.example.com/auth/google/callback/"}):
                self.assertEqual(google_auth.cookie_same_site(), "none")

    def test_identity_claim_validation_and_timezone_independent_expiry(self):
        claims = {"iss": "https://accounts.google.com", "aud": TEST_ENV["GOOGLE_CLIENT_ID"],
                  "exp": time.time() + 3600, "nonce": "nonce", "sub": "subject", "email": "owner@gmail.com", "email_verified": True}
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims) as verifier:
            result = google_auth.verify_google_identity("token", google_auth.digest("nonce"))
            self.assertTrue(result["authoritative"])
            self.assertEqual(verifier.call_args.kwargs["audience"], TEST_ENV["GOOGLE_CLIENT_ID"])
        for field, value in [("iss", "attacker"), ("aud", "other-client"), ("exp", time.time()-1),
                              ("azp", "other-client"), ("nonce", "wrong"), ("sub", ""), ("email_verified", False), ("email", "invalid")]:
            with self.subTest(field=field), patch("google.oauth2.id_token.verify_oauth2_token", return_value={**claims, field: value}):
                with self.assertRaises(ValueError):
                    google_auth.verify_google_identity("token", google_auth.digest("nonce"))
        # Use an epoch boundary unrelated to the host's local timezone.
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value={**claims, "exp": 5001}), patch.object(google_auth.time, "time", return_value=5000):
            google_auth.verify_google_identity("token", google_auth.digest("nonce"))
        with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=ValueError("invalid signature")):
            with self.assertRaises(ValueError):
                google_auth.verify_google_identity("tampered-token", google_auth.digest("nonce"))

    def test_popup_escapes_untrusted_message(self):
        response = google_auth.popup_response({"status": "error", "message": "</script><script>alert(1)</script>"})
        self.assertNotIn(b"<script>alert", response.body)
        self.assertNotIn(b"postMessage({}, '*')", response.body)


if __name__ == "__main__":
    unittest.main()
