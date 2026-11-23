"""Account-specific application snapshots using a fresh database."""

import unittest
from types import SimpleNamespace

import test_google_auth as auth_tests
from app.authentication.sessions import get_current_user


class AppliedJobsTests(unittest.TestCase):
    setUp = auth_tests.GoogleAuthTests.setUp
    tearDown = auth_tests.GoogleAuthTests.tearDown
    local_user = auth_tests.GoogleAuthTests.local_user

    def test_confirmation_is_idempotent_and_history_is_private(self):
        owner = self.local_user(password=None)
        other = self.local_user("Other", "other@example.org", password=None)
        job_id = 8201471003
        path = f"/applied-jobs/affirm/{job_id}/"
        snapshot = {"title": "Backend engineer", "location": "Remote, Canada", "url": "https://www.affirm.com/careers/engineer"}
        self.assertEqual(self.client.put(path, json=snapshot).status_code, 401)
        self.assertEqual(self.client.get("/applied-jobs/").status_code, 401)
        auth_tests.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=owner)
        saved = self.client.put(path, json=snapshot)
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json(), {**snapshot, "board": "affirm", "id": job_id, "company": "Affirm"})
        self.assertEqual(self.client.put(path, json=snapshot).json(), saved.json())
        self.assertEqual(self.client.get("/applied-jobs/").json()["jobs"], [saved.json()])
        auth_tests.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=other)
        self.assertEqual(self.client.get("/applied-jobs/").json()["jobs"], [])
        self.assertEqual(self.client.put(path, json=snapshot).status_code, 200)
        self.assertEqual(self.client.get("/applied-jobs/").json()["jobs"], [saved.json()])

    def test_returns_only_known_employer_links_and_accepts_only_supported_postings(self):
        owner = self.local_user(password=None)
        auth_tests.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=owner)
        snapshot = {"title": "Backend engineer", "location": "", "url": "https://unrelated.example/"}
        result = self.client.put("/applied-jobs/affirm/1/", json=snapshot)
        self.assertEqual(result.json()["url"], "https://job-boards.greenhouse.io/affirm/jobs/1")
        for path in ["not-a-board/1/", "affirm/0/", f"affirm/{2**63}/"]:
            self.assertEqual(self.client.put("/applied-jobs/" + path, json=snapshot).status_code, 422)
