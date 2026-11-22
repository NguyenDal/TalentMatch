"""Public job discovery, ranked locally against synthetic resumes and fixed board fixtures."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from threading import Event
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from test_google_auth import app
from app.authentication.limits import AuthRequestLimiter
from app.authentication.sessions import get_current_user
from app.matching import greenhouse, job_search


def listing(job_id, title, location, content):
    return {"id": job_id, "title": title, "location": {"name": location}, "content": content,
            "absolute_url": f"https://job-boards.greenhouse.io/d2l/jobs/{job_id}"}


LISTINGS = {
    "d2l": [listing(1, "Reporting developer", "Remote, Canada", "&lt;p&gt;Develop reports using SQL and Python.&lt;/p&gt;"),
            listing(2, "Software engineer", "Toronto, Canada", "<p>Build interfaces in React and JavaScript.</p>")],
    "affirm": [listing(3, "Senior Accountant", "Austin, USA", "<p>Accounting and payroll.</p>")],
    "mozilla": [],
}


class JobSearchTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=20)
        self.addCleanup(app.dependency_overrides.clear)
        self.enterContext(patch.object(job_search, "search_limiter", AuthRequestLimiter()))
        self.cache = greenhouse.PublicBoards()
        self.enterContext(patch.object(job_search, "boards", self.cache))
        self.upstream = self.enterContext(patch.object(greenhouse, "public_json", side_effect=self.board_response))

    def board_response(self, url, limit, params):
        board = url.split("/")[-2]
        self.assertEqual(url, f"{greenhouse.API}/{board}/jobs")
        self.assertEqual(params, {"content": "true"})
        return {"jobs": LISTINGS[board]}

    def test_browsing_keyword_location_and_resume_rank_do_not_transmit_private_inputs(self):
        self.assertEqual(len(self.client.post("/job-search/").json()["jobs"]), 3)
        filtered = self.client.post("/job-search/", data={"keywords": "software", "location": "Toronto"}).json()
        self.assertEqual([job["id"] for job in filtered["jobs"]], [2])
        private_cv = b"Confidential sample person. I automated SQL and Python reports."
        ranked = self.client.post("/job-search/", files={"resume": ("sample.txt", private_cv, "text/plain")},
                                  data={"location": "Canada"})
        self.assertEqual(ranked.status_code, 200)
        data = ranked.json()
        self.assertEqual(data["stale_boards"], [])
        self.assertEqual(data["unavailable_boards"], [])
        self.assertEqual([item["id"] for item in data["jobs"]], [1])
        self.assertEqual(data["jobs"][0]["matched_terms"], ["Python", "SQL"])
        self.assertNotIn("description", data["jobs"][0])
        self.assertNotIn("score", data["jobs"][0])
        self.assertNotIn("confidential", str(self.upstream.call_args_list).lower())
        self.assertEqual(self.upstream.call_count, 3)

    def test_unfamiliar_occupation_can_match_its_title_without_matching_the_skill_list(self):
        result = self.client.post("/job-search/", files={"resume": ("cv.txt", b"I am an accountant.", "text/plain")}).json()
        self.assertEqual(result["jobs"][0]["id"], 3)
        self.assertEqual(result["jobs"][0]["matched_terms"], ["accountant"])
        self.assertEqual(self.client.post("/job-search/", files={"resume": ("cv.txt", b"Senior staff team.", "text/plain")}).json()["jobs"], [])

    def test_input_failures_and_signed_out_requests_skip_public_feeds(self):
        cases = [
            ({"keywords": "x" * 201}, {}, 422),
            ({"location": "x" * 121}, {}, 422),
            ({}, {"resume": ("cv.bin", b"no", "text/plain")}, 422),
        ]
        for data, files, status in cases:
            self.assertEqual(self.client.post("/job-search/", data=data, files=files).status_code, status)
        app.dependency_overrides.clear()
        self.assertEqual(self.client.post("/job-search/").status_code, 401)
        self.assertEqual(self.client.get("/job-search/mozilla/7/").status_code, 401)
        self.upstream.assert_not_called()

    def test_selected_listing_rechecks_public_id_and_returns_readable_text(self):
        content = "&lt;h2&gt;About the role&lt;/h2&gt;&lt;p&gt;Build &lt;b&gt;R&amp;amp;D&lt;/b&gt; software.&lt;/p&gt;"
        with patch.object(job_search, "public_json", return_value={"id": 1, "content": content}) as fetch:
            result = self.client.get("/job-search/d2l/1/")
            self.assertEqual(result.json()["description"], "About the role\nBuild R&D software.")
            fetch.assert_called_once_with(f"{greenhouse.API}/d2l/jobs/1", greenhouse.DETAIL_BYTES)
            self.assertEqual(self.client.get("/job-search/not-a-board/1/").status_code, 404)
            self.assertEqual(self.client.get("/job-search/d2l/0/").status_code, 404)
            self.assertEqual(fetch.call_count, 1)
        missing = httpx.HTTPStatusError("removed", request=httpx.Request("GET", "https://example.test/"),
                                        response=httpx.Response(404))
        with patch.object(job_search, "public_json", side_effect=missing):
            self.assertEqual(self.client.get("/job-search/d2l/1/").status_code, 404)
        with patch.object(job_search, "public_json", side_effect=httpx.ConnectError("offline")):
            self.assertEqual(self.client.get("/job-search/d2l/1/").status_code, 503)

    def test_all_unavailable_reports_upstream_failure_instead_of_no_openings(self):
        self.upstream.side_effect = httpx.ConnectError("offline")
        self.assertEqual(self.client.post("/job-search/").status_code, 503)
        self.assertEqual(self.client.post("/job-search/").status_code, 503)
        self.assertEqual(self.upstream.call_count, 3)


class PublicBoardAdapterTests(unittest.TestCase):
    def test_cache_single_flight_and_stale_expiry(self):
        tick = [1000]
        calls = []
        wait = Event()
        outage = set()

        def fetch(board):
            calls.append(board)
            if not wait.wait(timeout=3):
                self.fail("fixture unlock timed out")
            if board in outage:
                raise ValueError("unavailable")
            return (board,)

        cache = greenhouse.PublicBoards(fetch=fetch, clock=lambda: tick[0])
        with ThreadPoolExecutor(4) as threads:
            pending = [threads.submit(cache.listings) for _ in range(4)]
            wait.set()
            for task in pending:
                self.assertEqual(task.result(), (list(greenhouse.BOARDS), [], []))
        self.assertCountEqual(calls, list(greenhouse.BOARDS))
        outage.add("d2l")
        tick[0] += 601
        self.assertEqual(cache.listings()[1:], ([], ["D2L"]))
        tick[0] += 3000
        jobs, unavailable, stale = cache.listings()
        self.assertEqual((unavailable, stale), (["D2L"], []))
        self.assertNotIn("d2l", jobs)
        outage.clear()
        tick[0] += 61
        self.assertEqual(cache.listings()[1:], ([], []))

    def test_preserves_full_description_and_safe_employer_urls(self):
        description = greenhouse.plain_description("<div>Job</div><ul><li>Python</li><li>S&amp;P</li></ul><style>css</style>")
        self.assertEqual(description, "Job\nPython\nS&P")
        url = "https://www.d2l.com/careers/jobs/?job_id=1"
        self.assertEqual(greenhouse.posting_url("d2l", 1, url), url)
        self.assertEqual(greenhouse.posting_url("d2l", 1, "https://unrelated.example/job"),
                         "https://job-boards.greenhouse.io/d2l/jobs/1")

    def test_upstream_size_is_bounded_before_parsing(self):
        @contextmanager
        def stream(*args, **kwargs):
            yield httpx.Response(200, request=httpx.Request("GET", "https://example.test"),
                                 content=b'{"jobs":[]}')
        with patch.object(greenhouse.httpx, "stream", stream):
            with self.assertRaisesRegex(ValueError, "limits"):
                greenhouse.public_json("https://example.test", 4)
