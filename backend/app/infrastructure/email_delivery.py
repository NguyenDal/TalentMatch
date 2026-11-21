"""Transactional email delivery with safe errors and no automatic send retries."""

import asyncio
import base64
import os
import re
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import formataddr
from urllib.parse import quote

import httpx
from email_validator import EmailNotValidError, validate_email


SMTP2GO_SEND_URL = "https://api.smtp2go.com/v3/email/send"
GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_ROOT = "https://gmail.googleapis.com/gmail/v1/users"
GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
CONFIGURATION_ERROR = "Email delivery is not configured. Please contact the site owner."
DELIVERY_ERROR = "Email delivery is temporarily unavailable. Please try again later."


class EmailDeliveryError(RuntimeError):
    """A message safe to expose to the caller, without provider or message data."""


def _address(value):
    try:
        return validate_email(value, check_deliverability=False).normalized
    except (EmailNotValidError, TypeError):
        raise EmailDeliveryError(CONFIGURATION_ERROR) from None


def _gmail_credential(name):
    value = os.getenv(name, "")
    if (not value or len(value) > 4096 or not value.isascii()
            or any(character.isspace() or ord(character) < 33 or ord(character) > 126 for character in value)):
        raise EmailDeliveryError(CONFIGURATION_ERROR)
    return value


async def _send_gmail(sender, sender_name, recipient, subject, body):
    client_id = _gmail_credential("GMAIL_CLIENT_ID")
    client_secret = _gmail_credential("GMAIL_CLIENT_SECRET")
    refresh_token = _gmail_credential("GMAIL_REFRESH_TOKEN")
    if not re.fullmatch(r"[A-Za-z0-9._-]+\.apps\.googleusercontent\.com", client_id):
        raise EmailDeliveryError(CONFIGURATION_ERROR)
    try:
        message = EmailMessage(policy=SMTP)
        message["From"] = formataddr((sender_name, sender))
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(body)
        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    except (ValueError, TypeError, UnicodeError):
        raise EmailDeliveryError(CONFIGURATION_ERROR) from None

    async def deliver():
        # OAuth credentials stay server-side and are never written to disk.
        # Each bounded attempt gets a fresh short-lived token. Neither the
        # refresh nor the send is automatically retried after ambiguous failure.
        async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            response = await client.post(GMAIL_TOKEN_URL, data={
                "client_id": client_id, "client_secret": client_secret,
                "refresh_token": refresh_token, "grant_type": "refresh_token",
            }, headers={"Accept": "application/json"})
            response.raise_for_status()
            grant = response.json()
            if not isinstance(grant, dict) or grant.get("error"):
                raise EmailDeliveryError(DELIVERY_ERROR)
            scope = grant.get("scope")
            # Fail closed if the owner consented to a broader Gmail grant.
            # This adapter neither reads mail nor requests extra permissions.
            if not isinstance(scope, str) or set(scope.split()) != {GMAIL_SEND_SCOPE}:
                raise EmailDeliveryError(CONFIGURATION_ERROR)
            access_token = grant.get("access_token")
            if (not isinstance(access_token, str) or not access_token or len(access_token) > 4096
                    or not access_token.isascii() or any(ord(c) < 33 or ord(c) > 126 for c in access_token)
                    or str(grant.get("token_type", "")).lower() != "bearer"
                    or type(grant.get("expires_in")) is not int or grant["expires_in"] <= 0):
                raise EmailDeliveryError(DELIVERY_ERROR)
            # Naming the configured mailbox makes Google enforce account
            # ownership without requesting profile or mailbox-reading scopes.
            send_url = f"{GMAIL_SEND_ROOT}/{quote(sender, safe='')}/messages/send"
            response = await client.post(send_url, json={"raw": encoded_message}, headers={
                "Authorization": f"Bearer {access_token}", "Accept": "application/json",
            })
            response.raise_for_status()
            result = response.json()
            if (not isinstance(result, dict) or result.get("error")
                    or not isinstance(result.get("id"), str) or not result["id"].strip()):
                raise EmailDeliveryError(DELIVERY_ERROR)

    try:
        await asyncio.wait_for(deliver(), timeout=30)
    except EmailDeliveryError:
        raise
    except (httpx.HTTPError, ValueError, TypeError, TimeoutError):
        raise EmailDeliveryError(DELIVERY_ERROR) from None


async def send_email(*, recipient: str, subject: str, body: str):
    """Wait for the configured provider to accept one plain-text message.

    Acceptance is not a guarantee of inbox delivery. Provider errors deliberately
    omit response bodies: those can contain reset tokens, addresses, or keys.
    """
    provider = os.getenv("MAIL_PROVIDER", "smtp").strip().lower()
    sender = _address(os.getenv("MAIL_FROM", ""))
    recipient = _address(recipient)
    sender_name = os.getenv("MAIL_FROM_NAME", "TalentMatch").strip()
    if any(character in sender_name + subject for character in "\r\n"):
        raise EmailDeliveryError(CONFIGURATION_ERROR)

    if provider == "gmail_api":
        await _send_gmail(sender, sender_name, recipient, subject, body)
        return

    if provider == "smtp2go":
        api_key = os.getenv("SMTP2GO_API_KEY", "").strip()
        if not api_key:
            raise EmailDeliveryError(CONFIGURATION_ERROR)
        payload = {
            "sender": formataddr((sender_name, sender)),
            "to": [recipient],
            "subject": subject,
            "text_body": body,
        }
        try:
            # A fixed HTTPS destination and no redirects prevent sending the API
            # key to an alternate host. Retrying sends can create duplicates.
            async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
                response = await client.post(
                    SMTP2GO_SEND_URL,
                    headers={"X-Smtp2go-Api-Key": api_key, "Accept": "application/json"},
                    json=payload,
                )
                response.raise_for_status()
                result = response.json()
            data = result.get("data") if isinstance(result, dict) else None
            if (not isinstance(data, dict) or data.get("succeeded") != 1
                    or data.get("failed") != 0 or data.get("failures")
                    or data.get("error") or data.get("error_code")):
                raise EmailDeliveryError(DELIVERY_ERROR)
        except EmailDeliveryError:
            raise
        except (httpx.HTTPError, ValueError, TypeError):
            raise EmailDeliveryError(DELIVERY_ERROR) from None
        return

    if provider != "smtp":
        raise EmailDeliveryError(CONFIGURATION_ERROR)

    # SMTP is retained for local development and hosts that allow it. Import and
    # validate its settings only when selected; API mode needs no SMTP secrets.
    from fastapi_mail import ConnectionConfig, FastMail, MessageSchema

    if not all(os.getenv(key) for key in ("MAIL_USERNAME", "MAIL_PASSWORD", "MAIL_SERVER")):
        raise EmailDeliveryError(CONFIGURATION_ERROR)
    try:
        config = ConnectionConfig(
            MAIL_USERNAME=os.environ["MAIL_USERNAME"],
            MAIL_PASSWORD=os.environ["MAIL_PASSWORD"],
            MAIL_FROM=sender,
            MAIL_FROM_NAME=sender_name,
            MAIL_SERVER=os.environ["MAIL_SERVER"],
            MAIL_PORT=int(os.getenv("MAIL_PORT", "587")),
            MAIL_STARTTLS=os.getenv("MAIL_STARTTLS", "true").lower() == "true",
            MAIL_SSL_TLS=os.getenv("MAIL_SSL_TLS", "false").lower() == "true",
            USE_CREDENTIALS=True,
            VALIDATE_CERTS=True,
        )
        message = MessageSchema(subject=subject, recipients=[recipient], body=body, subtype="plain")
    except (ValueError, TypeError):
        raise EmailDeliveryError(CONFIGURATION_ERROR) from None
    try:
        await asyncio.wait_for(FastMail(config).send_message(message), timeout=15)
    except Exception:
        raise EmailDeliveryError(DELIVERY_ERROR) from None
