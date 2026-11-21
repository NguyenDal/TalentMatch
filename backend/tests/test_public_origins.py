"""Public URL defaults without network calls or developer environment reads."""

import os
import unittest
from unittest.mock import patch

import test_google_auth  # noqa: F401 - bootstrap app imports with isolated credentials
from app.authentication.google import frontend_origin, google_settings


class PublicOriginTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {}, clear=True)
        environment.start()
        self.addCleanup(environment.stop)

    def test_local_defaults(self):
        self.assertEqual(frontend_origin(), "http://localhost:3000")
        self.assertEqual(google_settings()[2], "http://localhost:8000/auth/google/callback/")

    def test_render_defaults_normalize_trailing_slash(self):
        with patch.dict(os.environ, {"RENDER_EXTERNAL_URL": "https://talentmatch.onrender.com/"}):
            self.assertEqual(frontend_origin(), "https://talentmatch.onrender.com")
            self.assertEqual(google_settings()[2], "https://talentmatch.onrender.com/auth/google/callback/")

    def test_explicit_overrides_take_priority(self):
        with patch.dict(os.environ, {
            "RENDER_EXTERNAL_URL": "https://talentmatch.onrender.com",
            "FRONTEND_URL": "https://app.example.com/",
            "GOOGLE_REDIRECT_URI": "https://api.example.com/auth/google/callback/",
        }):
            self.assertEqual(frontend_origin(), "https://app.example.com")
            self.assertEqual(google_settings()[2], "https://api.example.com/auth/google/callback/")

    def test_frontend_override_does_not_change_backend_callback(self):
        with patch.dict(os.environ, {
            "RENDER_EXTERNAL_URL": "https://talentmatch.onrender.com",
            "FRONTEND_URL": "https://app.example.com",
        }):
            self.assertEqual(google_settings()[2], "https://talentmatch.onrender.com/auth/google/callback/")

    def test_empty_overrides_use_render_defaults(self):
        with patch.dict(os.environ, {
            "RENDER_EXTERNAL_URL": "https://talentmatch.onrender.com",
            "FRONTEND_URL": " ", "GOOGLE_REDIRECT_URI": "",
        }):
            self.assertEqual(frontend_origin(), "https://talentmatch.onrender.com")
            self.assertEqual(google_settings()[2], "https://talentmatch.onrender.com/auth/google/callback/")

    def test_invalid_render_origin_is_rejected_for_both_defaults(self):
        for origin in (
            "http://talentmatch.onrender.com", "https://talentmatch.onrender.com/path",
            "https://talentmatch.onrender.com?query=1", "https://talentmatch.onrender.com#fragment",
            "https://user:password@talentmatch.onrender.com",
        ):
            with self.subTest(origin=origin), patch.dict(os.environ, {"RENDER_EXTERNAL_URL": origin}):
                with self.assertRaisesRegex(RuntimeError, "RENDER_EXTERNAL_URL"):
                    frontend_origin()
                with self.assertRaisesRegex(RuntimeError, "RENDER_EXTERNAL_URL"):
                    google_settings()

    def test_invalid_explicit_overrides_do_not_silently_fall_back(self):
        with patch.dict(os.environ, {
            "RENDER_EXTERNAL_URL": "https://talentmatch.onrender.com",
            "FRONTEND_URL": "http://public.example.com",
            "GOOGLE_REDIRECT_URI": "http://public.example.com/auth/google/callback/",
        }):
            with self.assertRaisesRegex(RuntimeError, "FRONTEND_URL"):
                frontend_origin()
            with self.assertRaisesRegex(RuntimeError, "GOOGLE_REDIRECT_URI"):
                google_settings()


if __name__ == "__main__":
    unittest.main()
