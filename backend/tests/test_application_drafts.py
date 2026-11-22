"""Application writing tools use fictional files and a mocked provider."""

import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from test_match_analysis import main, response
from app.matching.limits import MatchLimiter, MAX_RESUME_BYTES
from app.matching.application_drafts import OUTPUT_TOKENS


SOURCE = b"Alex Sample\nalex@example.test\nBuilt a React component library and wrote its usage guides."
TARGET = "Maintain a React component library and its documentation."
LETTER_PARTS = {
    "name": "Alex Sample", "contact": ["alex@example.test"], "links": [],
    "addressee": "", "employer": "", "role": "", "paragraphs": ["I built a React component library."],
}
RESUME = {
    "name": "Alex Sample", "contact": ["alex@example.test"], "education": [], "experience": [],
    "projects": [{"name": "Component library", "technologies": "React", "dates": "", "bullets": ["Wrote usage guides."]}],
    "skills": [{"category": "Frontend", "items": ["React"]}],
}


class ApplicationDraftTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)
        main.app.dependency_overrides[main.get_current_user] = lambda: SimpleNamespace(id=89)
        self.addCleanup(main.app.dependency_overrides.clear)
        self.limiter = MatchLimiter(per_user=100, total=1000)
        self.enterContext(patch.object(main, "match_limiter", self.limiter))
        self.create = self.enterContext(patch.object(main.client.chat.completions, "create"))

    def submit(self, tool, question="", job=TARGET, source=SOURCE, filename="candidate.txt", letter_date="2026-03-01"):
        return self.client.post(f"/application-tools/{tool}/", data={"question": question, "job_description": job, "letter_date": letter_date},
                                files={"resume": (filename, source, "application/octet-stream")})

    def test_each_tool_returns_its_own_grounded_draft_in_one_call(self):
        for tool in ("resume", "cover-letter", "question"):
            with self.subTest(tool=tool), patch.object(main, "MODEL", "gpt-6-luna"):
                question = "Describe your experience writing component documentation."
                answer = {"text": "I wrote the usage guides for a React component library."}
                self.create.return_value = response({"resume": RESUME, "cover-letter": LETTER_PARTS, "question": answer}[tool])
                result = self.submit(tool, question)
                self.assertEqual(result.status_code, 200, result.text)
                if tool == "cover-letter":
                    self.assertEqual(result.json()["letter"], {
                        "name": "Alex Sample", "contact": ["alex@example.test"], "links": [], "date": "March 1, 2026",
                        "recipient": ["Hiring Team"], "subject": "", "salutation": "Dear Hiring Team,",
                        "paragraphs": LETTER_PARTS["paragraphs"], "closing": "Sincerely,", "signature": "Alex Sample",
                    })
                    self.assertEqual(result.json()["text"].split("\n\n"), [
                        "Alex Sample\nalex@example.test", "March 1, 2026", "Hiring Team", "Dear Hiring Team,",
                        *LETTER_PARTS["paragraphs"], "Sincerely,\nAlex Sample",
                    ])
                else:
                    self.assertEqual(result.json(), {"resume": RESUME} if tool == "resume" else answer)
                self.assertEqual(result.headers["cache-control"], "no-store")
                self.create.assert_called_once()
                arguments = self.create.call_args.kwargs
                self.assertEqual(arguments["max_completion_tokens"], OUTPUT_TOKENS[tool])
                if tool != "resume":
                    output = arguments["response_format"]
                    self.assertEqual(output["type"], "json_schema")
                    self.assertTrue(output["json_schema"]["strict"])
                    required_keys = list(LETTER_PARTS) if tool == "cover-letter" else ["text"]
                    self.assertEqual(output["json_schema"]["schema"]["required"], required_keys)
                    self.assertFalse(output["json_schema"]["schema"]["additionalProperties"])
                user_message = json.loads(arguments["messages"][1]["content"])
                self.assertEqual(user_message["resume"], SOURCE.decode())
                self.assertEqual(user_message["job_posting"], TARGET)
                self.assertEqual(user_message.get("question"), question if tool == "question" else None)
                self.create.reset_mock()

    def test_letter_header_uses_candidate_and_posting_sources_separately(self):
        self.create.return_value = response({
            **LETTER_PARTS, "contact": ["alex@example.test", "jobs@example.test"],
            "links": ["https://sample.test/portfolio", "https://missing.test"],
            "employer": "Paperworks", "role": "UI Engineer", "addressee": "Interface Team",
        })
        source = SOURCE + b"\nhttps://sample.test/portfolio"
        posting = "Paperworks seeks a UI Engineer. Address the letter to the Interface Team. Email jobs@example.test."
        result = self.submit("cover-letter", job=posting, source=source).json()
        self.assertEqual(result["letter"]["recipient"], ["Interface Team", "Paperworks"])
        self.assertEqual(result["letter"]["salutation"], "Dear Interface Team,")
        self.assertEqual(result["letter"]["contact"], ["alex@example.test"])
        self.assertEqual(result["letter"]["links"], ["https://sample.test/portfolio"])
        self.assertEqual(result["letter"]["subject"], "UI Engineer")
        self.assertIn("Re: UI Engineer", result["text"])

        self.create.return_value = response({
            **LETTER_PARTS, "name": "Unknown Person", "role": "VP of Engineering",
            "addressee": "Executive Recruiter", "employer": "Nonexistent Employer",
        })
        letter = self.submit("cover-letter").json()["letter"]
        self.assertEqual((letter["name"], letter["signature"], letter["subject"]), ("", "", ""))
        self.assertEqual(letter["recipient"], ["Hiring Team"])

    def test_question_keeps_partial_answer_and_request_for_missing_information(self):
        text = "I wrote usage guides for our React components. Please confirm whether you hold the requested credential."
        self.create.return_value = response({"text": text})
        result = self.submit("question", question="Describe your writing experience and confirm your certification.")
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json(), {"text": text})
        self.create.assert_called_once()

    def test_contact_details_are_taken_from_candidate_even_if_provider_invents_one(self):
        draft = {**RESUME, "name": "Different Person", "contact": ["alex@example.test", "hiring@example.test"]}
        self.create.return_value = response(draft)
        result = self.submit("resume").json()["resume"]
        self.assertEqual(result["name"], "")
        self.assertEqual(result["contact"], ["alex@example.test"])

    def test_refuses_empty_wrong_or_truncated_draft_without_leaking_provider_content(self):
        malformed = copy.deepcopy(RESUME)
        malformed["projects"][0]["bullets"] = [" "]
        blank = {**RESUME, "skills": [], "projects": []}
        for tool, provider_response in (
            ("resume", response(malformed)), ("resume", response(blank)),
            ("cover-letter", response({"text": ["private-provider-content"]})),
            ("cover-letter", response({**LETTER_PARTS, "paragraphs": [" "]})),
            ("question", response({"text": " "})), ("question", response({"text": "private-provider-content"}, "length")),
        ):
            with self.subTest(tool=tool):
                self.create.return_value = provider_response
                result = self.submit(tool, "Why this project?")
                self.assertEqual(result.status_code, 502)
                self.assertNotIn("private-provider-content", result.text)

    def test_validation_stops_before_any_provider_request(self):
        cases = [
            ("question", {"question": " "}, 422),
            ("question", {"question": "x" * 2001}, 413),
            ("resume", {"source": b" "}, 422),
            ("resume", {"job": " "}, 422),
            ("cover-letter", {"job": "x" * 30001}, 413),
            ("resume", {"source": b"x" * (MAX_RESUME_BYTES + 1)}, 413),
            ("cover-letter", {"filename": "unsupported.jpg"}, 422),
            ("cover-letter", {"letter_date": "not a date"}, 422),
            ("unknown", {}, 422),
        ]
        for tool, kwargs, expected in cases:
            with self.subTest(tool=tool, expected=expected):
                self.assertEqual(self.submit(tool, **kwargs).status_code, expected)
        self.create.assert_not_called()

    def test_signed_out_requests_never_reach_provider_or_reserve_budget(self):
        main.app.dependency_overrides.clear()
        for tool in ("resume", "cover-letter", "question"):
            self.assertEqual(self.submit(tool, "Why?").status_code, 401)
        self.assertFalse(self.limiter.events)
        self.create.assert_not_called()

    def test_writing_and_matching_use_one_budget(self):
        with patch.object(main, "match_limiter", MatchLimiter(per_user=1)):
            self.create.return_value = response(LETTER_PARTS)
            self.assertEqual(self.submit("cover-letter").status_code, 200)
            result = self.client.post("/upload-resume/", data={"job_description": TARGET},
                                      files={"resume": ("candidate.txt", SOURCE, "text/plain")})
        self.assertEqual(result.status_code, 429)
        self.assertIn("retry-after", result.headers)
        self.create.assert_called_once()
