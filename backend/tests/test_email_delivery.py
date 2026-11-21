"""Provider fixture checks; no credentials, messages, or network requests."""

import os
import base64
import unittest
from email import policy
from email.parser import BytesParser
from unittest.mock import AsyncMock, patch

import httpx

from app.infrastructure import email_delivery


class EmailDeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "MAIL_PROVIDER": "smtp2go", "SMTP2GO_API_KEY": "fixture-key",
            "MAIL_FROM": "sender@example.com", "MAIL_FROM_NAME": "TalentMatch",
        }, clear=True)
        self.env.start()
        self.http = patch("app.infrastructure.email_delivery.httpx.AsyncClient")
        self.client_class = self.http.start()
        self.client = self.client_class.return_value.__aenter__.return_value
        self.client.post = AsyncMock()

    def tearDown(self):
        self.http.stop()
        self.env.stop()

    async def send(self):
        await email_delivery.send_email(recipient="user@example.com", subject="Verify your email", body="secret-code")

    def response(self, data, status=200):
        return httpx.Response(status, json=data, request=httpx.Request("POST", email_delivery.SMTP2GO_SEND_URL))

    async def test_api_succeeds_without_smtp_settings(self):
        self.client.post.return_value = self.response({"data": {"succeeded": 1, "failed": 0, "failures": []}})
        await self.send()
        self.client_class.assert_called_once_with(timeout=15, follow_redirects=False)
        self.client.post.assert_awaited_once()
        args = self.client.post.call_args
        self.assertEqual(args.args[0], email_delivery.SMTP2GO_SEND_URL)
        self.assertEqual(args.kwargs["headers"]["X-Smtp2go-Api-Key"], "fixture-key")
        self.assertEqual(args.kwargs["json"]["to"], ["user@example.com"])
        self.assertEqual(args.kwargs["json"]["text_body"], "secret-code")
        self.assertNotIn("api_key", args.kwargs["json"])

    async def test_200_with_failed_recipient_is_not_success(self):
        self.client.post.return_value = self.response({"data": {
            "succeeded": 0, "failed": 1, "failures": ["private-provider-detail"],
        }})
        with self.assertRaisesRegex(email_delivery.EmailDeliveryError, "temporarily unavailable") as caught:
            await self.send()
        self.assertNotIn("private-provider-detail", str(caught.exception))
        self.client.post.assert_awaited_once()

    async def test_http_failure_is_safe_and_not_retried(self):
        self.client.post.return_value = self.response({"error": "secret-code fixture-key"}, 401)
        with self.assertRaisesRegex(email_delivery.EmailDeliveryError, "temporarily unavailable") as caught:
            await self.send()
        self.assertNotIn("secret-code", str(caught.exception))
        self.assertNotIn("fixture-key", str(caught.exception))
        self.client.post.assert_awaited_once()

    async def test_timeout_is_safe_and_not_retried(self):
        self.client.post.side_effect = httpx.ReadTimeout("private-provider-detail")
        with self.assertRaisesRegex(email_delivery.EmailDeliveryError, "temporarily unavailable"):
            await self.send()
        self.client.post.assert_awaited_once()

    async def test_missing_key_and_unknown_provider_do_not_send(self):
        for change in ({"SMTP2GO_API_KEY": ""}, {"MAIL_PROVIDER": "unknown"}):
            with self.subTest(change=change), patch.dict(os.environ, change):
                with self.assertRaisesRegex(email_delivery.EmailDeliveryError, "not configured"):
                    await self.send()
        self.client.post.assert_not_awaited()

    async def test_malformed_success_response_is_rejected(self):
        for value in (None, [], {"data": {}}, {"data": {"succeeded": 1, "failed": 1}}):
            with self.subTest(value=value):
                self.client.post.return_value = self.response(value)
                with self.assertRaises(email_delivery.EmailDeliveryError):
                    await self.send()

    async def test_default_smtp_remains_available(self):
        with patch.dict(os.environ, {
            "MAIL_PROVIDER": "smtp", "MAIL_USERNAME": "sender@example.com",
            "MAIL_PASSWORD": "fixture-password", "MAIL_SERVER": "smtp.example.com",
        }), patch("fastapi_mail.FastMail.send_message", new_callable=AsyncMock) as smtp:
            await self.send()
            smtp.assert_awaited_once()
            self.assertEqual(smtp.call_args.args[0].body, "secret-code")
        self.client.post.assert_not_awaited()


class GmailEmailDeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "MAIL_PROVIDER": "gmail_api", "MAIL_FROM": "owner@gmail.com",
            "MAIL_FROM_NAME": "TalentMatch",
            "GMAIL_CLIENT_ID": "fixture.apps.googleusercontent.com",
            "GMAIL_CLIENT_SECRET": "fixture-client-secret",
            "GMAIL_REFRESH_TOKEN": "fixture-refresh-token",
        }, clear=True)
        self.env.start()
        self.http = patch("app.infrastructure.email_delivery.httpx.AsyncClient")
        self.client_class = self.http.start()
        self.client = self.client_class.return_value.__aenter__.return_value
        self.client.post = AsyncMock()
        self.grant = {
            "access_token": "fixture-access-token", "token_type": "Bearer",
            "expires_in": 3600, "scope": email_delivery.GMAIL_SEND_SCOPE,
        }

    def tearDown(self):
        self.http.stop()
        self.env.stop()

    def response(self, value, status=200):
        return httpx.Response(status, json=value, request=httpx.Request("POST", email_delivery.GMAIL_TOKEN_URL))

    async def send(self, **overrides):
        await email_delivery.send_email(**{
            "recipient": "recipient@example.com", "subject": "Your verification code",
            "body": "Hello, résumé owner.\nYour code is 123456.", **overrides,
        })

    async def test_send_only_refresh_and_mime_message_without_smtp_credentials(self):
        self.client.post.side_effect = [self.response(self.grant), self.response({"id": "accepted-message"})]
        await self.send()
        self.client_class.assert_called_once_with(timeout=15, follow_redirects=False)
        refresh, send = self.client.post.await_args_list
        self.assertEqual(refresh.args, (email_delivery.GMAIL_TOKEN_URL,))
        self.assertEqual(refresh.kwargs["data"], {
            "client_id": "fixture.apps.googleusercontent.com", "client_secret": "fixture-client-secret",
            "refresh_token": "fixture-refresh-token", "grant_type": "refresh_token",
        })
        self.assertEqual(send.args, (email_delivery.GMAIL_SEND_ROOT + "/owner%40gmail.com/messages/send",))
        self.assertEqual(send.kwargs["headers"]["Authorization"], "Bearer fixture-access-token")
        self.assertEqual(set(send.kwargs["json"]), {"raw"})
        message = BytesParser(policy=policy.default).parsebytes(base64.urlsafe_b64decode(send.kwargs["json"]["raw"]))
        self.assertEqual(str(message["From"]), "TalentMatch <owner@gmail.com>")
        self.assertEqual(str(message["To"]), "recipient@example.com")
        self.assertEqual(str(message["Subject"]), "Your verification code")
        self.assertEqual(message.get_content_type(), "text/plain")
        self.assertIn("résumé owner", message.get_content())
        self.assertIn("123456", message.get_content())
        self.assertNotIn("fixture-refresh-token", repr(send))
        self.assertEqual(self.client.post.await_count, 2)

    async def test_invalid_configuration_never_contacts_google(self):
        for change in (
            {"GMAIL_CLIENT_ID": ""}, {"GMAIL_CLIENT_ID": "wrong-provider.example.com"},
            {"GMAIL_CLIENT_SECRET": ""}, {"GMAIL_REFRESH_TOKEN": ""},
            {"GMAIL_REFRESH_TOKEN": "token\nextra"}, {"GMAIL_CLIENT_SECRET": "embedded space"},
            {"GMAIL_REFRESH_TOKEN": "x" * 4097}, {"MAIL_FROM": "not-an-email"},
            {"MAIL_FROM_NAME": "TalentMatch\r\nExtra: header"},
        ):
            with self.subTest(change=list(change)), patch.dict(os.environ, change):
                with self.assertRaisesRegex(email_delivery.EmailDeliveryError, "not configured"):
                    await self.send()
        with self.assertRaisesRegex(email_delivery.EmailDeliveryError, "not configured"):
            await self.send(subject="Hello\nExtra: header")
        self.client.post.assert_not_awaited()

    async def test_refresh_failure_does_not_send_retry_or_expose_secrets(self):
        for status in (302, 400, 401, 429, 500):
            self.client.post.reset_mock()
            self.client.post.return_value = self.response({"error": "fixture-refresh-token private-provider-detail"}, status)
            with self.subTest(status=status), self.assertRaises(email_delivery.EmailDeliveryError) as caught:
                await self.send()
            self.assertEqual(str(caught.exception), email_delivery.DELIVERY_ERROR)
            self.client.post.assert_awaited_once()

    async def test_missing_or_broader_scopes_stop_before_delivery(self):
        for scope in (None, "", "https://www.googleapis.com/auth/gmail.readonly",
                      email_delivery.GMAIL_SEND_SCOPE + " https://mail.google.com/"):
            self.client.post.reset_mock()
            self.client.post.return_value = self.response({**self.grant, "scope": scope})
            with self.subTest(scope=scope), self.assertRaisesRegex(email_delivery.EmailDeliveryError, "not configured"):
                await self.send()
            self.client.post.assert_awaited_once()

    async def test_malformed_token_responses_never_reach_send_endpoint(self):
        values = [None, [], {"error": "private-provider-detail"}]
        for field, value in (
            ("access_token", ""), ("access_token", "contains\r\nnewline"),
            ("access_token", "x" * 4097), ("token_type", "other"),
            ("expires_in", None), ("expires_in", True), ("expires_in", 0),
        ):
            values.append({**self.grant, field: value})
        for value in values:
            self.client.post.reset_mock()
            self.client.post.return_value = self.response(value)
            with self.assertRaisesRegex(email_delivery.EmailDeliveryError, "temporarily unavailable"):
                await self.send()
            self.client.post.assert_awaited_once()

    async def test_send_failures_are_safe_and_never_retried(self):
        failures = [self.response({"error": "private-provider-detail 123456"}, status) for status in (302, 401, 403, 429, 500)]
        failures.append(httpx.ReadTimeout("fixture-access-token 123456"))
        for failure in failures:
            self.client.post.reset_mock()
            self.client.post.side_effect = [self.response(self.grant), failure]
            with self.assertRaises(email_delivery.EmailDeliveryError) as caught:
                await self.send()
            self.assertEqual(str(caught.exception), email_delivery.DELIVERY_ERROR)
            self.assertEqual(self.client.post.await_count, 2)

    async def test_send_success_requires_message_id(self):
        for value in (None, [], {}, {"id": ""}, {"id": 123}, {"id": "sent", "error": "failure"}):
            self.client.post.reset_mock()
            self.client.post.side_effect = [self.response(self.grant), self.response(value)]
            with self.assertRaisesRegex(email_delivery.EmailDeliveryError, "temporarily unavailable"):
                await self.send()
            self.assertEqual(self.client.post.await_count, 2)

    async def test_complete_attempt_has_bounded_deadline(self):
        async def deadline(coroutine, timeout):
            coroutine.close()
            self.assertEqual(timeout, 30)
            raise TimeoutError("private timeout details")
        with patch.object(email_delivery.asyncio, "wait_for", side_effect=deadline):
            with self.assertRaises(email_delivery.EmailDeliveryError) as caught:
                await self.send()
        self.assertEqual(str(caught.exception), email_delivery.DELIVERY_ERROR)
        self.client.post.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
