"""Same-origin hosting and free-instance limits, without external services."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from fastapi.responses import HTMLResponse, JSONResponse

from app.matching.limits import MatchLimiter
from app.infrastructure.web_runtime import configure_web_runtime, MAX_UPLOAD_BODY, UploadBodyLimitMiddleware


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
        @self.app.post("/upload-profile-image/")
        def upload():
            return {"ok": True}

        @self.app.get("/private-fixture/")
        def private_fixture():
            return JSONResponse({"ok": True}, headers={"Cache-Control": "public, max-age=3600"})

        @self.app.get("/cookie-fixture/")
        def cookie_fixture():
            response = JSONResponse({"ok": True})
            response.set_cookie("fixture", "value", httponly=True)
            return response

        @self.app.get("/auth/google/callback/")
        def popup_fixture():
            return HTMLResponse("<title>OAuth fixture</title>", headers={
                "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
                "Content-Security-Policy": "default-src 'none'; script-src 'nonce-fixture'",
                "Cross-Origin-Opener-Policy": "unsafe-none",
            })

        configure_web_runtime(self.app, frontend_dir=root)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.directory.cleanup()

    def test_spa_routes_refresh_without_intercepting_api_errors(self):
        for route in ("/", "/login", "/signup", "/contact", "/dashboard/settings/security", "/reset-password?token=example",
                      "/resume-builder", "/cover-letter", "/application-questions", "/jobs", "/job-fit"):
            with self.subTest(route=route):
                response = self.client.get(route)
                self.assertEqual(response.status_code, 200)
                self.assertIn("<title>TalentMatch</title>", response.text)
                expected_cache = "no-store" if route.startswith("/reset-password") else "no-cache"
                self.assertEqual(response.headers["cache-control"], expected_cache)
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


    def test_avatar_body_limits_have_image_specific_errors(self):
        declared = self.client.post("/upload-profile-image/", content=b"small", headers={"content-length": str(MAX_UPLOAD_BODY + 1)})
        self.assertEqual(declared.status_code, 413)
        chunks = iter([b"x" * MAX_UPLOAD_BODY, b"overflow"])
        streamed = self.client.post("/upload-profile-image/", content=chunks)
        self.assertEqual(streamed.status_code, 413)
        for response in (declared, streamed):
            self.assertIn("profile picture", response.json()["detail"])
            self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(self.client.post("/upload-profile-image/", content=b"small").status_code, 200)

    def test_generated_documents_use_bounded_multipart_uploads(self):
        for route in ("/application-tools/resume/", "/application-tools/cover-letter/", "/application-tools/question/", "/job-search/"):
            with self.subTest(route=route):
                response = self.client.post(route, content=b"small", headers={"content-length": str(MAX_UPLOAD_BODY + 1)})
                self.assertEqual(response.status_code, 413)
                self.assertEqual(response.headers["cache-control"], "no-store")
        chunks = iter([b"x" * MAX_UPLOAD_BODY, b"overflow"])
        self.assertEqual(self.client.post("/application-tools/resume/", content=chunks).status_code, 413)

    def test_sensitive_responses_are_not_cached(self):
        responses = (
            self.client.get("/private-fixture/", headers={"Authorization": "Bearer fixture"}),
            self.client.get("/cookie-fixture/"),
            self.client.get("/me/"),
            self.client.post("/upload-resume/", content=b"small"),
            self.client.get("/reset-password?token=fixture"),
        )
        for response in responses:
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertEqual(response.headers["pragma"], "no-cache")
            self.assertEqual(response.headers["referrer-policy"], "no-referrer")
            self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_popup_headers_and_public_asset_caching_are_preserved(self):
        popup = self.client.get("/auth/google/callback/")
        self.assertEqual(popup.headers["cache-control"], "no-store")
        self.assertEqual(popup.headers["referrer-policy"], "no-referrer")
        self.assertEqual(popup.headers["cross-origin-opener-policy"], "unsafe-none")
        self.assertEqual(popup.headers["content-security-policy"], "default-src 'none'; script-src 'nonce-fixture'")
        asset = self.client.get("/static/js/main.1234abcd.js")
        self.assertIn("immutable", asset.headers["cache-control"])
        self.assertEqual(self.client.get("/").headers["cache-control"], "no-cache")


class UploadBodyMiddlewareTests(unittest.IsolatedAsyncioTestCase):
    async def test_avatar_receive_chunks_are_bounded_before_endpoint(self):
        endpoint = AsyncMock()
        middleware = UploadBodyLimitMiddleware(endpoint, max_bytes=8)
        receive = AsyncMock(side_effect=[
            {"type": "http.request", "body": b"12345", "more_body": True},
            {"type": "http.request", "body": b"6789", "more_body": False},
        ])
        send = AsyncMock()
        await middleware({"type": "http", "method": "POST", "path": "/upload-profile-image/", "headers": []}, receive, send)
        endpoint.assert_not_awaited()
        self.assertEqual(send.await_args_list[0].args[0]["status"], 413)
        self.assertIn(b"profile picture", send.await_args_list[1].args[0]["body"])


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
