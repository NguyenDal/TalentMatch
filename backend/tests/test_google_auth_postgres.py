"""Opt-in PostgreSQL row-lock regressions for Google account reclamation.

Run only against a disposable, migrated branch. Set TALENTMATCH_TEST_DATABASE_URL
and TALENTMATCH_POSTGRES_TEST_HOST to that branch's direct connection and host.
The tests use random usernames and delete only records created by this run.
Ordinary unittest discovery skips these tests without both settings.
"""

import asyncio
import os
import secrets
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlsplit

from test_google_auth import TEST_ENV, ORIGIN, popup_payload
from fastapi import Request, Response
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import get_db
from app.auth import hash_password
from app.models import GoogleAuthFlow, GoogleAuthTicket, GoogleIdentity, LoginEvent, User, UserSession
from app import google_auth


@unittest.skipUnless(os.getenv("TALENTMATCH_TEST_DATABASE_URL") and os.getenv("TALENTMATCH_POSTGRES_TEST_HOST"),
                     "Requires an explicitly selected disposable PostgreSQL branch")
class PostgresGoogleConcurrencyTests(unittest.TestCase):
    def setUp(self):
        url = make_url(os.environ["TALENTMATCH_TEST_DATABASE_URL"])
        if url.host != os.environ["TALENTMATCH_POSTGRES_TEST_HOST"] or url.get_backend_name() != "postgresql":
            self.fail("The PostgreSQL test connection must match the explicitly selected branch host.")
        self.environment = patch.dict(os.environ, {**TEST_ENV, "GOOGLE_COOKIE_SAMESITE": "lax"})
        self.environment.start()
        self.prefix = "race_" + secrets.token_hex(6)
        self.engine = create_engine(url, connect_args={"connect_timeout": 10,
            "options": "-c lock_timeout=5000 -c statement_timeout=10000",
            "application_name": self.prefix}, pool_pre_ping=True)
        self.sessions = sessionmaker(bind=self.engine)
        self.user_ids = []
        self.flow_hashes = []
        self.ticket_hashes = []
        def override_db():
            with self.sessions() as db:
                yield db
        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        with self.sessions.begin() as db:
            for model in (GoogleAuthTicket, GoogleIdentity, LoginEvent, UserSession):
                column = model.target_user_id if model is GoogleAuthTicket else model.user_id
                db.query(model).filter(column.in_(self.user_ids)).delete(synchronize_session=False)
            db.query(GoogleAuthTicket).filter(GoogleAuthTicket.token_hash.in_(self.ticket_hashes)).delete(synchronize_session=False)
            db.query(GoogleAuthFlow).filter(GoogleAuthFlow.state_hash.in_(self.flow_hashes)).delete(synchronize_session=False)
            db.query(User).filter(User.id.in_(self.user_ids)).delete(synchronize_session=False)
        self.engine.dispose()
        self.environment.stop()

    def account_and_ticket(self):
        email = self.prefix + "@gmail.com"
        with self.sessions.begin() as db:
            user = User(username=self.prefix, email=email, email_verified=False,
                        hashed_password=hash_password("old-password"))
            db.add(user)
            db.flush()
            user_id = user.id
            self.user_ids.append(user_id)
        with patch("app.main.geo_lookup", AsyncMock(return_value="Test location")):
            response = self.client.post("/login/", data={"username": self.prefix, "password": "old-password"})
        self.assertEqual(response.status_code, 200, response.text)
        old_auth = response.json()
        response = self.client.get("/auth/google/start/", follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        state = parse_qs(urlsplit(response.headers["location"]).query)["state"][0]
        self.flow_hashes.append(google_auth.digest(state))
        identity = {"email": email, "subject": self.prefix, "authoritative": True}
        with patch.object(google_auth, "exchange_code", AsyncMock(return_value="signed-test-token")), \
             patch.object(google_auth, "verify_google_identity", return_value=identity):
            response = self.client.get("/auth/google/callback/", params={"state": state, "code": "test-code"})
        pending = popup_payload(response)
        self.assertEqual(pending["status"], "link_required")
        self.ticket_hashes.append(google_auth.digest(pending["ticket"]))
        return user_id, old_auth, pending

    def test_old_password_login_cannot_finish_after_reclamation(self):
        user_id, _, pending = self.account_and_ticket()
        geo_started = threading.Event()
        release_geo = threading.Event()
        async def paused_geo(_):
            geo_started.set()
            await asyncio.to_thread(release_geo.wait, 10)
            return "Test location"
        def stale_login():
            with TestClient(app) as client:
                return client.post("/login/", data={"username": self.prefix, "password": "old-password"})
        with patch("app.main.geo_lookup", paused_geo), ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(stale_login)
            try:
                self.assertTrue(geo_started.wait(5), "Login did not reach the controlled network wait")
                response = self.client.post("/auth/google/link/", headers=ORIGIN,
                    json={"ticket": pending["ticket"], "confirm": True})
                self.assertEqual(response.status_code, 200, response.text)
            finally:
                release_geo.set()
            self.assertEqual(future.result(timeout=10).status_code, 401)
        with self.sessions() as db:
            self.assertIsNone(db.get(User, user_id).hashed_password)
            self.assertEqual(db.query(LoginEvent).filter(LoginEvent.user_id == user_id, LoginEvent.active.is_(True)).count(), 1)

    def test_old_session_waiting_for_lock_cannot_set_password_after_reclamation(self):
        user_id, old_auth, pending = self.account_and_ticket()
        def stale_password_setup():
            with TestClient(app) as client:
                return client.post("/account/set-password/", data={"new_password": "attacker-password"},
                    headers={"Authorization": "Bearer " + old_auth["access_token"]})
        with ThreadPoolExecutor(max_workers=1) as executor, self.sessions() as reclaim_db:
            reclaim_db.query(User).filter(User.id == user_id).with_for_update().one()
            future = executor.submit(stale_password_setup)
            try:
                deadline = time.monotonic() + 3
                with self.engine.connect().execution_options(isolation_level="AUTOCOMMIT") as observer:
                    while time.monotonic() < deadline:
                        waiting = observer.execute(text("SELECT count(*) FROM pg_stat_activity WHERE application_name = :name AND wait_event_type = 'Lock'"), {"name": self.prefix}).scalar_one()
                        if waiting:
                            break
                        time.sleep(0.025)
                    self.assertTrue(waiting, "Password setup did not wait on the PostgreSQL user row lock")
                request = Request({"type": "http", "method": "POST", "path": "/auth/google/link/",
                    "headers": [(b"origin", TEST_ENV["FRONTEND_URL"].encode()),
                        (b"cookie", (google_auth.COOKIE_NAME + "=" + self.client.cookies.get(google_auth.COOKIE_NAME)).encode())],
                    "client": ("127.0.0.1", 12345)})
                google_auth.confirm_link(google_auth.LinkRequest(ticket=pending["ticket"], confirm=True),
                                         request, Response(), reclaim_db)
            finally:
                reclaim_db.rollback()
            self.assertEqual(future.result(timeout=10).status_code, 401)
        with self.sessions() as db:
            self.assertIsNone(db.get(User, user_id).hashed_password)
            self.assertEqual(db.query(GoogleIdentity).filter(GoogleIdentity.user_id == user_id).count(), 1)


if __name__ == "__main__":
    unittest.main()
