"""Account deletion with real foreign-key checks and isolated authentication."""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import event
from sqlalchemy.exc import SQLAlchemyError

import test_google_auth as auth_tests
from app.models import AppliedJob, PolicyAcceptance


class AccountDeletionTests(unittest.TestCase):
    tearDown = auth_tests.GoogleAuthTests.tearDown
    local_user = auth_tests.GoogleAuthTests.local_user

    def setUp(self):
        auth_tests.GoogleAuthTests.setUp(self)
        # SQLite defaults to ignoring foreign keys; enforce them to reproduce
        # the deployed Postgres failure instead of accepting orphaned records.
        with self.engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        self.owner = self.local_user(username="DeletingUser", email="delete@example.com")
        self.other = self.local_user(username="RemainingUser", email="keep@example.com")
        with self.sessions() as db:
            for user_id in (self.owner, self.other):
                db.add(PolicyAcceptance(user_id=user_id, version=auth_tests.POLICY_VERSION))
                db.add(AppliedJob(user_id=user_id, board="affirm", job_id=8201471003, title="Engineer",
                                  location="Canada", url="https://affirm.com/jobs/"))
                db.add(auth_tests.GoogleIdentity(user_id=user_id, subject=f"google-{user_id}"))
                db.add(auth_tests.GoogleAuthTicket(
                    token_hash=f"ticket-{user_id}", browser_hash="browser", kind="link",
                    subject=f"subject-{user_id}", email=f"user-{user_id}@example.com",
                    authoritative_email=True, target_user_id=user_id,
                    expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
                ))
                for index in range(2):
                    sid = f"session-{user_id}-{index}"
                    db.add(auth_tests.UserSession(user_id=user_id, session_id=sid, revoked=bool(index)))
                    db.add(auth_tests.LoginEvent(user_id=user_id, session_id=sid, active=not bool(index)))
            db.commit()

    def headers(self, user_id):
        token = auth_tests.jwt.encode({
            "sub": "DeletingUser" if user_id == self.owner else "RemainingUser",
            "user_id": user_id, "sid": f"session-{user_id}-0",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }, auth_tests.TEST_ENV["SECRET_KEY"], algorithm="HS256")
        return {"Authorization": "Bearer " + token}

    def assert_records(self, user_id, present):
        with self.sessions() as db:
            self.assertEqual(db.get(auth_tests.User, user_id) is not None, present)
            for model, column, count in (
                (AppliedJob, AppliedJob.user_id, 1),
                (PolicyAcceptance, PolicyAcceptance.user_id, 1),
                (auth_tests.UserSession, auth_tests.UserSession.user_id, 2),
                (auth_tests.LoginEvent, auth_tests.LoginEvent.user_id, 2),
                (auth_tests.GoogleIdentity, auth_tests.GoogleIdentity.user_id, 1),
                (auth_tests.GoogleAuthTicket, auth_tests.GoogleAuthTicket.target_user_id, 1),
            ):
                self.assertEqual(db.query(model).filter(column == user_id).count(), count if present else 0)

    def test_self_delete_removes_dependencies_and_keeps_other_user(self):
        result = self.client.delete("/account/delete/", headers=self.headers(self.owner))
        self.assertEqual(result.status_code, 200, result.text)
        self.assert_records(self.owner, False)
        self.assert_records(self.other, True)
        self.assertEqual(self.client.get("/me/", headers=self.headers(self.owner)).status_code, 401)
        self.assertEqual(self.client.get("/me/", headers=self.headers(self.other)).status_code, 200)

    def test_failure_rolls_back_all_dependent_deletions(self):
        def fail_user_delete(connection, cursor, statement, parameters, context, executemany):
            if statement.startswith("DELETE FROM users "):
                raise SQLAlchemyError("simulated final delete failure")
        event.listen(self.engine, "before_cursor_execute", fail_user_delete)
        try:
            result = self.client.delete("/account/delete/", headers=self.headers(self.owner))
        finally:
            event.remove(self.engine, "before_cursor_execute", fail_user_delete)
        self.assertEqual(result.status_code, 500)
        self.assertNotIn("simulated", result.text)
        self.assert_records(self.owner, True)
        self.assert_records(self.other, True)
        self.assertEqual(self.client.get("/me/", headers=self.headers(self.owner)).status_code, 200)

    def test_missing_or_revoked_authentication_cannot_delete(self):
        self.assertEqual(self.client.delete("/account/delete/").status_code, 401)
        with self.sessions() as db:
            db.query(auth_tests.LoginEvent).filter(auth_tests.LoginEvent.user_id == self.owner).update({"active": False})
            db.commit()
        self.assertEqual(self.client.delete("/account/delete/", headers=self.headers(self.owner)).status_code, 401)
        self.assert_records(self.owner, True)
        self.assert_records(self.other, True)


if __name__ == "__main__":
    unittest.main()
