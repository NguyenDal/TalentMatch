"""Session metadata checks using isolated accounts and ASGI request fixtures."""

import unittest
from unittest.mock import AsyncMock, patch

from fastapi import Request

import test_google_auth as auth_tests
from app.authentication.sessions import issue_session


class SessionMetadataTests(unittest.TestCase):
    setUp = auth_tests.GoogleAuthTests.setUp
    tearDown = auth_tests.GoogleAuthTests.tearDown
    local_user = auth_tests.GoogleAuthTests.local_user

    def test_issue_session_uses_server_resolved_client_address(self):
        user_id = self.local_user()
        request = Request({
            "type": "http", "method": "GET", "path": "/auth/google/callback/",
            "client": ("192.0.2.10", 12345),
            "headers": [(b"x-forwarded-for", b"198.51.100.20"), (b"user-agent", b"Fixture browser")],
        })
        with self.sessions() as db:
            issue_session(db.get(auth_tests.User, user_id), request, db)
            record = db.query(auth_tests.LoginEvent).one()
            self.assertEqual(record.ip, "192.0.2.10")
            self.assertEqual(record.user_agent, "Fixture browser")

    def test_missing_client_address_uses_explicit_unknown_metadata(self):
        user_id = self.local_user()
        request = Request({
            "type": "http", "method": "GET", "path": "/auth/google/callback/",
            "headers": [(b"x-forwarded-for", b"198.51.100.20")],
        })
        with self.sessions() as db:
            issue_session(db.get(auth_tests.User, user_id), request, db)
            self.assertEqual(db.query(auth_tests.LoginEvent).one().ip, "Unknown")

    def test_password_login_geo_lookup_matches_session_metadata(self):
        self.local_user()
        with patch("app.main.geo_lookup", AsyncMock(return_value="Test location")) as lookup:
            response = self.client.post("/login/", data={"username": "Existing", "password": "old-password"},
                                        headers={"X-Forwarded-For": "198.51.100.20"})
        self.assertEqual(response.status_code, 200, response.text)
        lookup.assert_awaited_once_with("testclient")
        with self.sessions() as db:
            self.assertEqual(db.query(auth_tests.LoginEvent).one().ip, "testclient")


if __name__ == "__main__":
    unittest.main()
