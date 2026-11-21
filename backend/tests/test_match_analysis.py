"""Matching API regressions using provider fixtures; no live AI, email, or DB."""

import json
import io
import unittest
from zipfile import ZipFile, ZIP_DEFLATED
from types import SimpleNamespace
from unittest.mock import Mock, patch

import httpx
import openai

# Reuse the isolated application bootstrap: dotenv is disabled and all secrets
# are dummy values. No developer credentials are read by these tests.
from test_google_auth import TEST_ENV
from fastapi.testclient import TestClient
from app import main
from app.matching.limits import MatchLimiter


def response(payload, finish="stop"):
    content = payload if isinstance(payload, str) else json.dumps(payload)
    return SimpleNamespace(choices=[SimpleNamespace(
        finish_reason=finish, message=SimpleNamespace(content=content)
    )])


def provider_error(error_type, status, code=None):
    return error_type(
        "private-provider-detail-with-credential",
        response=httpx.Response(status, request=httpx.Request("POST", "https://api.example.test/chat")),
        body={"message": "private-provider-detail-with-credential", "code": code},
    )


REQUIREMENTS = [
    {"requirement": "React", "explanation": "Build interfaces"},
    {"requirement": "TypeScript", "explanation": "Maintain typed code"},
]
MATCHES = [
    {"requirement": "React", "met": True, "explanation": "React project listed"},
    {"requirement": "TypeScript", "met": False, "explanation": "No TypeScript example"},
]
SUGGESTIONS = [{"question": "Which project should I discuss?", "answer": "Discuss your React interface."}]


class MatchAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict("os.environ", TEST_ENV)
        self.environment.start()
        self.client = TestClient(main.app)
        main.app.dependency_overrides[main.get_current_user] = lambda: SimpleNamespace(id=7)
        self.limit_patch = patch.object(main, "match_limiter", MatchLimiter(per_user=100, total=1000))
        self.limit_patch.start()
        self.create_patch = patch.object(main.client.chat.completions, "create")
        self.create = self.create_patch.start()

    def tearDown(self):
        self.create_patch.stop()
        self.limit_patch.stop()
        main.app.dependency_overrides.clear()
        self.client.close()
        self.environment.stop()

    def submit(self, description="Build React and TypeScript interfaces.", filename="resume.txt", content=b"Built a React project."):
        return self.client.post("/upload-resume/", data={"job_description": description},
                                files={"resume": (filename, content, "application/octet-stream")})

    def test_successful_match_and_qa_preserve_contract(self):
        self.create.side_effect = [response(REQUIREMENTS), response(MATCHES), response(SUGGESTIONS)]
        with patch.object(main, "MODEL", "gpt-6-luna"):
            result = self.submit()
        self.assertEqual(result.status_code, 200, result.text)
        data = result.json()
        self.assertEqual(data["met_requirements"], ["React"])
        self.assertEqual(data["missing_requirements"], ["TypeScript"])
        self.assertEqual(data["ai_suggestions"], SUGGESTIONS)
        self.assertIn("React project listed", data["requirement_explanations"]["React"])
        self.assertEqual(self.create.call_count, 3)
        for call, limit in zip(self.create.call_args_list, [4096, 4096, 2048]):
            self.assertEqual(call.kwargs["model"], "gpt-6-luna")
            self.assertEqual(call.kwargs["max_completion_tokens"], limit)
            self.assertEqual(call.kwargs["reasoning_effort"], "none")
            self.assertNotIn("temperature", call.kwargs)
            self.assertNotIn("max_tokens", call.kwargs)

    def test_unauthenticated_upload_never_calls_provider(self):
        main.app.dependency_overrides.clear()
        result = self.submit()
        self.assertEqual(result.status_code, 401)
        self.create.assert_not_called()
        self.assertFalse(main.match_limiter.events)

    def test_oversized_inputs_stop_before_provider(self):
        cases = [
            {"description": "x" * 30_001},
            {"content": b"x" * 40_001},
            {"content": b"x" * (5 * 1024 * 1024 + 1)},
        ]
        for case in cases:
            with self.subTest(size=len(case.get("content", case.get("description", "")))):
                result = self.submit(**case)
                self.assertEqual(result.status_code, 413, result.text)
        self.create.assert_not_called()

    def test_failed_provider_request_releases_concurrency_slot(self):
        self.create.side_effect = RuntimeError("provider problem")
        self.assertEqual(self.submit().status_code, 500)
        self.assertEqual(main.match_limiter.active, set())

    def test_exact_resume_and_job_text_limits_are_accepted(self):
        self.create.side_effect = [response(REQUIREMENTS), response(MATCHES), response(SUGGESTIONS)]
        result = self.submit(description="j" * 30_000, content=b"r" * 40_000)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(self.create.call_count, 3)

    def test_hourly_user_and_global_limits_stop_before_provider(self):
        limiter = MatchLimiter(per_user=1, total=2)
        self.create.side_effect = [response(REQUIREMENTS), response(MATCHES), response(SUGGESTIONS)] * 2
        with patch.object(main, "match_limiter", limiter):
            self.assertEqual(self.submit().status_code, 200)
            blocked = self.submit()
            self.assertEqual(blocked.status_code, 429)
            self.assertEqual(blocked.headers["retry-after"], "3600")
            self.assertEqual(self.create.call_count, 3)
            main.app.dependency_overrides[main.get_current_user] = lambda: SimpleNamespace(id=8)
            self.assertEqual(self.submit().status_code, 200)
            main.app.dependency_overrides[main.get_current_user] = lambda: SimpleNamespace(id=9)
            self.assertEqual(self.submit().status_code, 429)
            self.assertEqual(self.create.call_count, 6)
        self.assertEqual(limiter.active, set())
        self.assertEqual(len(limiter.events), 2)

    def test_already_running_match_stops_duplicate_before_provider(self):
        with main.match_limiter.slot(7):
            result = self.submit()
            self.assertEqual(result.status_code, 429)
            self.assertEqual(result.headers["retry-after"], "15")
        self.create.assert_not_called()
        self.assertFalse(main.match_limiter.active)

    def test_input_validation_failure_releases_concurrency_slot(self):
        result = self.submit(description=" ")
        self.assertEqual(result.status_code, 422)
        self.assertFalse(main.match_limiter.active)
        self.create.assert_not_called()

    def test_docx_expansion_limits_are_checked_before_document_loading(self):
        cases = [
            [("word/document.xml", b"x" * (2 * 1024 * 1024 + 1))],
            [(f"word/media/image{i}.bin", b"x" * (1024 * 1024)) for i in range(21)],
            [(f"part{i}.bin", b"") for i in range(513)],
        ]
        for members in cases:
            with self.subTest(members=len(members)):
                archive = io.BytesIO()
                with ZipFile(archive, "w", compression=ZIP_DEFLATED) as output:
                    for name, content in members:
                        output.writestr(name, content)
                self.assertLess(len(archive.getvalue()), 5 * 1024 * 1024)
                with patch.object(main, "Document") as document:
                    result = self.submit(filename="resume.docx", content=archive.getvalue())
                    self.assertEqual(result.status_code, 413, result.text)
                    document.assert_not_called()
        self.create.assert_not_called()

    def test_pdf_page_and_incremental_text_limits_stop_parsing(self):
        page = SimpleNamespace(extract_text=lambda: "x" * 40_001)
        for pages in ([page] * 26, [page]):
            with self.subTest(pages=len(pages)), patch.object(main.PyPDF2, "PdfReader", return_value=SimpleNamespace(pages=pages)):
                result = self.submit(filename="resume.pdf", content=b"test PDF")
                self.assertEqual(result.status_code, 413, result.text)
        self.create.assert_not_called()

    def test_normal_docx_is_still_analyzed(self):
        document = main.Document()
        document.add_paragraph("Built a React project with tests.")
        content = io.BytesIO()
        document.save(content)
        self.create.side_effect = [response(REQUIREMENTS), response(MATCHES), response(SUGGESTIONS)]
        result = self.submit(filename="resume.docx", content=content.getvalue())
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(self.create.call_count, 3)

    def test_docx_exact_character_boundary_counts_only_real_separators(self):
        for paragraphs, status in ((["x" * 40_000], 200), (["x" * 20_000, "y" * 19_999], 200),
                                   (["x" * 20_000, "y" * 20_000], 413)):
            with self.subTest(paragraphs=len(paragraphs), status=status):
                document = main.Document()
                for text in paragraphs:
                    document.add_paragraph(text)
                content = io.BytesIO()
                document.save(content)
                self.create.reset_mock()
                self.create.side_effect = [response(REQUIREMENTS), response(MATCHES), response(SUGGESTIONS)]
                result = self.submit(filename="resume.docx", content=content.getvalue())
                self.assertEqual(result.status_code, status, result.text)
                self.assertEqual(self.create.call_count, 3 if status == 200 else 0)

    def test_pdf_exact_character_boundary_and_incremental_separator_limit(self):
        for texts, status in ((["x" * 40_000], 200), (["x" * 20_000, "y" * 19_999], 200),
                              (["x" * 20_000, "y" * 20_000, "Later page"], 413)):
            pages = [SimpleNamespace(extract_text=Mock(return_value=text)) for text in texts]
            with self.subTest(pages=len(pages), status=status), patch.object(main.PyPDF2, "PdfReader", return_value=SimpleNamespace(pages=pages)):
                self.create.reset_mock()
                self.create.side_effect = [response(REQUIREMENTS), response(MATCHES), response(SUGGESTIONS)]
                result = self.submit(filename="resume.pdf", content=b"ordinary mocked PDF")
                self.assertEqual(result.status_code, status, result.text)
                self.assertEqual(self.create.call_count, 3 if status == 200 else 0)
                if status == 413:
                    pages[2].extract_text.assert_not_called()

    def test_legacy_model_configuration_keeps_compatible_parameters(self):
        self.create.return_value = response(REQUIREMENTS)
        with patch.object(main, "MODEL", "gpt-4.1-mini"):
            self.assertEqual(main.extract_requirements_gpt("Role"), REQUIREMENTS)
        self.assertEqual(self.create.call_args.kwargs["temperature"], 0.2)
        self.assertEqual(self.create.call_args.kwargs["max_tokens"], 4096)
        self.assertNotIn("reasoning_effort", self.create.call_args.kwargs)

    def test_reasoning_options_match_original_and_later_gpt5_models(self):
        for model in ("gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5-mini-2025-08-07"):
            with self.subTest(model=model), patch.object(main, "MODEL", model):
                self.assertEqual(main.completion_options(0.2, 4096), {
                    "max_completion_tokens": 4096, "reasoning_effort": "minimal",
                })
        for model in ("gpt-5.1", "gpt-5.6-luna", "gpt-6-luna"):
            with self.subTest(model=model), patch.object(main, "MODEL", model):
                self.assertEqual(main.completion_options(0.2, 4096), {
                    "max_completion_tokens": 4096, "reasoning_effort": "none",
                })

    def test_provider_failures_are_http_errors_without_raw_exception_or_results(self):
        cases = [
            (provider_error(openai.NotFoundError, 404, "model_not_found"), 503, "configured"),
            (provider_error(openai.AuthenticationError, 401, "invalid_api_key"), 503, "configured"),
            (provider_error(openai.PermissionDeniedError, 403), 503, "configured"),
            (provider_error(openai.RateLimitError, 429, "insufficient_quota"), 503, "usage limit"),
            (provider_error(openai.RateLimitError, 429, "rate_limit_exceeded"), 429, "busy"),
            (openai.APITimeoutError(request=httpx.Request("POST", "https://api.example.test")), 504, "too long"),
            (openai.APIConnectionError(request=httpx.Request("POST", "https://api.example.test")), 503, "reached"),
            (provider_error(openai.InternalServerError, 500), 502, "could not complete"),
            (provider_error(openai.BadRequestError, 400, "context_length_exceeded"), 422, "too long"),
            (RuntimeError("private-provider-detail-with-credential"), 500, "couldn’t complete"),
        ]
        for error, status, message in cases:
            with self.subTest(error=type(error).__name__, status=status):
                self.create.reset_mock()
                self.create.side_effect = error
                result = self.submit()
                self.assertEqual(result.status_code, status, result.text)
                self.assertIn(message, result.json()["detail"])
                self.assertNotIn("private-provider-detail", result.text)
                self.assertNotIn("met_requirements", result.json())
                self.assertNotIn("ai_suggestions", result.json())
                self.assertEqual(self.create.call_count, 1)

    def test_invalid_or_empty_input_never_calls_provider(self):
        cases = [
            {"description": "   "}, {"content": b"   "},
            {"filename": "photo.jpg", "content": b"binary"},
            {"filename": "broken.pdf", "content": b"invalid PDF"},
            {"filename": "broken.docx", "content": b"invalid document"},
            {"filename": "broken.txt", "content": b"\xff\xfe"},
        ]
        for case in cases:
            with self.subTest(case=case):
                result = self.submit(**case)
                self.assertEqual(result.status_code, 422, result.text)
                self.assertNotIn("ai_suggestions", result.json())
        self.create.assert_not_called()

    def test_missing_key_is_configuration_error_without_provider_call(self):
        with patch.object(main, "client", None):
            result = self.submit()
        self.assertEqual(result.status_code, 503)
        self.assertIn("not configured", result.json()["detail"])
        self.create.assert_not_called()

    def test_valid_empty_extraction_has_specific_input_error_and_stops_pipeline(self):
        self.create.return_value = response([])
        result = self.submit()
        self.assertEqual(result.status_code, 422)
        self.assertIn("No resume-checkable requirements", result.json()["detail"])
        self.assertEqual(self.create.call_count, 1)

    def test_malformed_or_truncated_extraction_never_becomes_a_requirement(self):
        cases = [
            response("not json"), response({"error": "provider error"}),
            response(["React"]), response([{"requirement": ""}]),
            response([{"requirement": "React", "explanation": {"bad": "shape"}}]),
            response(REQUIREMENTS, finish="length"), response(None),
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                self.create.reset_mock()
                self.create.return_value = payload
                result = self.submit()
                self.assertEqual(result.status_code, 502, result.text)
                self.assertNotIn("AI Extraction Error", result.text)
                self.assertEqual(self.create.call_count, 1)

    def test_fenced_json_and_duplicate_requirements_are_handled(self):
        duplicate = REQUIREMENTS + [{"requirement": "react", "explanation": "Duplicate"}]
        self.create.side_effect = [response("```json\n" + json.dumps(duplicate) + "\n```"), response(MATCHES), response([])]
        result = self.submit()
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["met_requirements"], ["React"])
        self.assertEqual(result.json()["missing_requirements"], ["TypeScript"])

    def test_incomplete_unknown_duplicate_or_invalid_matches_fail_instead_of_wrong_score(self):
        cases = [[], MATCHES[:1], MATCHES + [MATCHES[0]],
                 [{**MATCHES[0], "met": "true"}, MATCHES[1]],
                 [{**MATCHES[0], "requirement": "Unrequested skill"}, MATCHES[1]]]
        for matches in cases:
            with self.subTest(matches=matches):
                self.create.reset_mock()
                self.create.side_effect = [response(REQUIREMENTS), response(matches)]
                result = self.submit()
                self.assertEqual(result.status_code, 502, result.text)
                self.assertEqual(self.create.call_count, 2)

    def test_invalid_qa_is_not_displayed_as_successful_analysis(self):
        self.create.side_effect = [response(REQUIREMENTS), response(MATCHES), response({"error": "private-provider-detail"})]
        result = self.submit()
        self.assertEqual(result.status_code, 502)
        self.assertNotIn("private-provider-detail", result.text)
        self.assertNotIn("ai_suggestions", result.json())

    def test_no_matched_requirements_is_a_real_success_when_missing_requirements_exist(self):
        missing = [{**match, "met": False} for match in MATCHES]
        self.create.side_effect = [response(REQUIREMENTS), response(missing), response([])]
        result = self.submit()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["met_requirements"], [])
        self.assertEqual(result.json()["missing_requirements"], ["React", "TypeScript"])


if __name__ == "__main__":
    unittest.main()
