"""Provider fixture checks; no credentials, messages, or network requests."""

import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app import email_delivery


class EmailDeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "MAIL_PROVIDER": "smtp2go", "SMTP2GO_API_KEY": "fixture-key",
            "MAIL_FROM": "sender@example.com", "MAIL_FROM_NAME": "TalentMatch",
        }, clear=True)
        self.env.start()
        self.http = patch("app.email_delivery.httpx.AsyncClient")
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


if __name__ == "__main__":
    unittest.main()
