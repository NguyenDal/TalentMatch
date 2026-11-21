"""Same-origin hosting and free-instance limits, without external services."""

import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.matching.limits import MatchLimiter
from app.infrastructure.web_runtime import configure_web_runtime, MAX_UPLOAD_BODY


class WebRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        (root / "static" / "js").mkdir(parents=True)
        (root / "index.html").write_text("<!doctype html><title>TalentMatch</title>" + "x" * 1500)
        (root / "static" / "js" / "main.1234abcd.js").write_text("console.log('build');")
        (root / "robots.txt").write_text("User-agent: *")
        (root / ".env").write_text("never exposed")
        self.app = FastAPI()

        @self.app.get("/me/")
        def me():
            raise HTTPException(401, "Sign in")

        @self.app.post("/upload-resume/")
        def upload():
            return {"ok": True}

        configure_web_runtime(self.app, frontend_dir=root)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.directory.cleanup()

    def test_spa_routes_refresh_without_intercepting_api_errors(self):
        for route in ("/", "/login", "/signup", "/contact", "/dashboard/settings/security", "/reset-password?token=example"):
            with self.subTest(route=route):
                response = self.client.get(route)
                self.assertEqual(response.status_code, 200)
                self.assertIn("<title>TalentMatch</title>", response.text)
                self.assertEqual(response.headers["cache-control"], "no-cache")
        self.assertEqual(self.client.get("/me/").status_code, 401)
        for route in ("/api/missing", "/auth/google/missing", "/static/missing.js", "/unknown", "/.env", "/%2e%2e/.env"):
            with self.subTest(route=route):
                response = self.client.get(route)
                self.assertEqual(response.status_code, 404)
                self.assertNotIn("<title>TalentMatch</title>", response.text)

    def test_hashed_assets_are_cached_and_html_is_compressed(self):
        asset = self.client.get("/static/js/main.1234abcd.js")
        self.assertEqual(asset.status_code, 200)
        self.assertIn("immutable", asset.headers["cache-control"])
        self.assertEqual(asset.headers["x-content-type-options"], "nosniff")
        self.assertEqual(self.client.get("/robots.txt").headers["cache-control"], "no-cache")
        page = self.client.get("/", headers={"accept-encoding": "gzip"})
        self.assertEqual(page.headers["content-encoding"], "gzip")

    def test_health_is_small_uncached_and_independent_of_db(self):
        response = self.client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_oversized_declared_and_chunked_uploads_are_rejected(self):
        response = self.client.post("/upload-resume/", content=b"small", headers={"content-length": str(MAX_UPLOAD_BODY + 1)})
        self.assertEqual(response.status_code, 413)
        chunks = iter([b"x" * MAX_UPLOAD_BODY, b"overflow"])
        response = self.client.post("/upload-resume/", content=chunks)
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.client.post("/upload-resume/", content=b"small").status_code, 200)


class MatchLimitTests(unittest.TestCase):
    def test_concurrency_is_released_after_failure(self):
        limiter = MatchLimiter(concurrent=1)
        with self.assertRaises(ValueError):
            with limiter.slot(1):
                with self.assertRaises(HTTPException) as blocked:
                    with limiter.slot(2):
                        self.fail("Concurrency limit bypassed")
                self.assertEqual(blocked.exception.status_code, 429)
                raise ValueError("request failed")
        with limiter.slot(2):
            self.assertEqual(limiter.active, {2})
        self.assertEqual(limiter.active, set())

    def test_hourly_limits_expire_and_apply_globally(self):
        now = [100.0]
        limiter = MatchLimiter(per_user=1, total=2, clock=lambda: now[0])
        with limiter.slot(1):
            pass
        with self.assertRaises(HTTPException):
            with limiter.slot(1):
                self.fail("User limit bypassed")
        with limiter.slot(2):
            pass
        with self.assertRaises(HTTPException):
            with limiter.slot(3):
                self.fail("Global limit bypassed")
        now[0] += 3601
        with limiter.slot(1):
            pass
        self.assertEqual(len(limiter.events), 1)


if __name__ == "__main__":
    unittest.main()
