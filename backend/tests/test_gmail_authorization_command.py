"""Offline operator-helper tests: fake credentials, no browser or network use."""

import base64
import hashlib
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urlsplit

from app.commands import authorize_gmail_sender as helper


CLIENT = {"client_id": "example.apps.googleusercontent.com", "client_secret": "dummy-desktop-secret"}
GRANT = {"access_token": "dummy-access", "refresh_token": "dummy-refresh", "token_type": "Bearer",
         "expires_in": 3600, "scope": helper.SEND_SCOPE}


class GmailAuthorizationCommandTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.addCleanup(self.directory.cleanup)

    def client_file(self, config=None):
        path = self.root / "desktop-client.json"
        data = {"installed": {**CLIENT, "auth_uri": helper.AUTH_URL, "token_uri": helper.TOKEN_URL}}
        path.write_text(json.dumps(data if config is None else config), encoding="utf-8")
        return path

    def test_accepts_only_desktop_client_with_fixed_google_endpoints(self):
        self.assertEqual(helper.load_desktop_client(self.client_file()), CLIENT)
        for config in ({"web": CLIENT}, {"installed": {**CLIENT, "auth_uri": "https://example.test/auth", "token_uri": helper.TOKEN_URL}}, {"installed": {**CLIENT, "auth_uri": helper.AUTH_URL, "token_uri": "https://example.test/token"}}):
            with self.subTest(config_type=list(config)), self.assertRaises(helper.AuthorizationError):
                helper.load_desktop_client(self.client_file(config))

    def test_authorization_requests_only_send_with_offline_consent_and_pkce(self):
        url, verifier, state = helper.new_authorization(CLIENT["client_id"], "http://127.0.0.1:12345/oauth/callback", "sender@example.com")
        parts = urlsplit(url)
        query = parse_qs(parts.query)
        self.assertEqual(f"{parts.scheme}://{parts.netloc}{parts.path}", helper.AUTH_URL)
        self.assertEqual(query["scope"], [helper.SEND_SCOPE])
        self.assertEqual(query["access_type"], ["offline"])
        self.assertEqual(query["prompt"], ["consent"])
        self.assertEqual(query["code_challenge_method"], ["S256"])
        self.assertEqual(query["state"], [state])
        expected = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
        self.assertEqual(query["code_challenge"], [expected])
        self.assertTrue(43 <= len(verifier) <= 128)
        self.assertNotIn(verifier, url)
        self.assertNotIn("client_secret", query)

    def test_callback_validates_state_host_loopback_and_granted_scope(self):
        path = "/oauth/callback?" + urlencode({"state": "expected-state", "code": "dummy-code", "scope": helper.SEND_SCOPE})
        self.assertEqual(helper.parse_callback(path, "127.0.0.1:12345", "127.0.0.1", "127.0.0.1:12345", "expected-state"), "dummy-code")
        cases = [
            (path, "localhost:12345", "127.0.0.1", "expected-state"),
            (path, "127.0.0.1:12345", "192.0.2.1", "expected-state"),
            (path, "127.0.0.1:12345", "127.0.0.1", "different-state"),
            (path + "&code=second-code", "127.0.0.1:12345", "127.0.0.1", "expected-state"),
            (path.replace("gmail.send", "gmail.readonly"), "127.0.0.1:12345", "127.0.0.1", "expected-state"),
        ]
        for supplied_path, host, peer, state in cases:
            with self.subTest(host=host, peer=peer), self.assertRaises(helper.AuthorizationError):
                helper.parse_callback(supplied_path, host, peer, "127.0.0.1:12345", state)

    def test_denied_consent_is_a_clear_safe_error(self):
        with self.assertRaisesRegex(helper.AuthorizationError, "not granted"):
            helper.parse_callback("/oauth/callback?state=expected-state&error=access_denied", "127.0.0.1:12345", "127.0.0.1", "127.0.0.1:12345", "expected-state")

    def test_manual_start_redirects_only_from_the_expected_loopback_address(self):
        handler = object.__new__(helper.CallbackHandler)
        handler.path = "/start"
        handler.client_address = ("127.0.0.1", 60000)
        handler.headers = {"Host": "127.0.0.1:12345"}
        handler.server = SimpleNamespace(expected_host="127.0.0.1:12345", authorization_url=helper.AUTH_URL + "?state=dummy-state")
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        handler.respond = Mock()
        handler.do_GET()
        handler.send_response.assert_called_once_with(302)
        handler.send_header.assert_any_call("Location", handler.server.authorization_url)
        handler.send_header.assert_any_call("Cache-Control", "no-store")
        handler.headers = {"Host": "localhost:12345"}
        handler.send_response.reset_mock()
        handler.do_GET()
        handler.send_response.assert_not_called()
        handler.respond.assert_called_once_with(400, "Use the local browser address printed by the helper.")

    def test_callback_response_does_not_echo_or_log_its_code(self):
        handler = object.__new__(helper.CallbackHandler)
        handler.path = "/oauth/callback?state=expected-state&code=dummy-code"
        handler.client_address = ("127.0.0.1", 60000)
        handler.headers = {"Host": "127.0.0.1:12345"}
        handler.server = SimpleNamespace(expected_host="127.0.0.1:12345", state="expected-state")
        handler.respond = Mock()
        with patch("sys.stderr", io.StringIO()) as captured:
            handler.do_GET()
            handler.log_message("GET %s", handler.path)
        self.assertEqual(handler.server.authorization_code, "dummy-code")
        self.assertTrue(handler.server.done)
        self.assertEqual(handler.respond.call_args.args[0], 200)
        self.assertNotIn("dummy-code", handler.respond.call_args.args[1])
        self.assertEqual(captured.getvalue(), "")

    def test_scope_and_offline_refresh_grant_are_required(self):
        self.assertEqual(helper.validate_grant(GRANT), "dummy-refresh")
        cases = [
            {**GRANT, "scope": ""}, {**GRANT, "scope": helper.SEND_SCOPE + " https://www.googleapis.com/auth/gmail.readonly"},
            {**GRANT, "refresh_token": None}, {**GRANT, "refresh_token_expires_in": 604800},
            {**GRANT, "expires_in": 0}, {**GRANT, "expires_in": True}, {**GRANT, "token_type": None},
        ]
        for result in cases:
            with self.subTest(scope=result.get("scope")), self.assertRaises(helper.AuthorizationError):
                helper.validate_grant(result)

    def test_code_exchange_uses_fixed_endpoint_pkce_and_no_redirect(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=None)
        response.read.return_value = json.dumps(GRANT).encode()
        opener = Mock()
        opener.open.return_value = response
        with patch.object(helper, "build_opener", return_value=opener) as build:
            self.assertEqual(helper.exchange_code(CLIENT, "dummy-code", "dummy-verifier", "http://127.0.0.1:12345/oauth/callback"), "dummy-refresh")
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, helper.TOKEN_URL)
        self.assertEqual(request.method, "POST")
        form = parse_qs(request.data.decode())
        self.assertEqual(form["code_verifier"], ["dummy-verifier"])
        self.assertEqual(form["grant_type"], ["authorization_code"])
        self.assertEqual(opener.open.call_args.kwargs["timeout"], 30)
        self.assertIsInstance(build.call_args.args[1], helper.NoRedirect)
        self.assertIsNone(helper.NoRedirect().redirect_request(None, None, 302, None, None, "https://example.test"))

    def test_provider_error_does_not_expose_response_or_code(self):
        opener = Mock()
        opener.open.side_effect = HTTPError(helper.TOKEN_URL, 400, "dummy-code private-provider-message", {}, None)
        with patch.object(helper, "build_opener", return_value=opener), self.assertRaises(helper.AuthorizationError) as error:
            helper.exchange_code(CLIENT, "dummy-code", "dummy-verifier", "http://127.0.0.1:12345/oauth/callback")
        self.assertNotIn("dummy-code", str(error.exception))
        self.assertNotIn("private-provider", str(error.exception))

    def test_output_must_be_new_inside_repository_and_git_ignored(self):
        output = self.root / ".env.gmail-sender"
        with patch.object(helper.subprocess, "run", return_value=SimpleNamespace(returncode=0)) as run:
            self.assertEqual(helper.validate_output(output, self.root), output.resolve())
            self.assertEqual(run.call_args.args[0][:3], ["git", "check-ignore", "--quiet"])
            for path in (self.root / "public.txt", self.root / ".env.example", self.root.parent / ".env.outside"):
                with self.assertRaises(helper.AuthorizationError):
                    helper.validate_output(path, self.root)
        with patch.object(helper.subprocess, "run", return_value=SimpleNamespace(returncode=1)), self.assertRaises(helper.AuthorizationError):
            helper.validate_output(output, self.root)
        output.write_text("existing", encoding="utf-8")
        with self.assertRaises(helper.AuthorizationError):
            helper.validate_output(output, self.root)

    def test_success_writes_expected_env_only_and_never_overwrites(self):
        output = self.root / ".env.gmail-sender"
        with patch.object(helper, "restrict_windows_file"):
            helper.write_env(output, CLIENT, "dummy-refresh", "sender@example.com")
            content = output.read_text()
            self.assertIn("MAIL_PROVIDER=gmail_api\n", content)
            self.assertIn("MAIL_FROM=sender@example.com\n", content)
            self.assertIn("GMAIL_REFRESH_TOKEN=dummy-refresh\n", content)
            self.assertNotIn("dummy-access", content)
            with self.assertRaises(helper.AuthorizationError):
                helper.write_env(output, CLIENT, "different-refresh", "sender@example.com")
            self.assertEqual(output.read_text(), content)

    def test_windows_acl_is_applied_before_any_secret_write(self):
        output = self.root / ".env.gmail-sender"
        def fail_permissions(path):
            self.assertEqual(Path(path).read_bytes(), b"")
            raise helper.AuthorizationError("permissions unavailable")
        with patch.object(helper.os, "name", "nt"), patch.object(helper, "restrict_windows_file", side_effect=fail_permissions), self.assertRaises(helper.AuthorizationError):
            helper.write_env(output, CLIENT, "dummy-refresh", "sender@example.com")
        self.assertFalse(output.exists())

    def test_manual_flow_uses_ephemeral_loopback_and_prints_no_secrets(self):
        output = self.root / ".env.gmail-sender"
        fake = Mock(server_port=12345)
        fake.__enter__ = Mock(return_value=fake)
        fake.__exit__ = Mock(return_value=None)
        def receive():
            fake.authorization_code = "dummy-code"
            fake.done = True
        fake.handle_request.side_effect = receive
        printed = io.StringIO()
        with patch.object(helper, "validate_output", return_value=output), patch.object(helper, "load_desktop_client", return_value=CLIENT), \
                patch.object(helper, "CallbackServer", return_value=fake) as server, patch.object(helper, "exchange_code", return_value="dummy-refresh"), \
                patch.object(helper, "write_env") as write, patch.object(helper.webbrowser, "open") as browser, patch("sys.stdout", printed):
            helper.authorize("not-read.json", output, "sender@example.com", "personal", manual_browser=True)
        server.assert_called_once_with(("127.0.0.1", 0), helper.CallbackHandler)
        browser.assert_not_called()
        write.assert_called_once_with(output, CLIENT, "dummy-refresh", "sender@example.com")
        text = printed.getvalue()
        self.assertIn("http://127.0.0.1:12345/start", text)
        for secret in (*CLIENT.values(), "dummy-code", "dummy-refresh", fake.state):
            self.assertNotIn(secret, text)

    def test_invalid_grant_and_timeout_do_not_write_output(self):
        for timed_out in (False, True):
            fake = Mock(server_port=12345)
            fake.__enter__ = Mock(return_value=fake)
            fake.__exit__ = Mock(return_value=None)
            def receive():
                fake.authorization_code = "dummy-code"
                fake.done = True
            fake.handle_request.side_effect = receive
            with self.subTest(timed_out=timed_out), patch.object(helper, "validate_output", return_value=self.root / ".env.sender"), \
                    patch.object(helper, "load_desktop_client", return_value=CLIENT), patch.object(helper, "CallbackServer", return_value=fake), \
                    patch.object(helper, "exchange_code", side_effect=helper.AuthorizationError("No offline grant")), patch.object(helper, "write_env") as write, \
                    patch("sys.stdout", io.StringIO()), self.assertRaises(helper.AuthorizationError):
                helper.authorize("not-read.json", self.root / ".env.sender", "sender@example.com", timeout=0 if timed_out else 300, manual_browser=True)
            write.assert_not_called()


if __name__ == "__main__":
    unittest.main()
