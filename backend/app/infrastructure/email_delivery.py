"""Transactional email delivery with safe errors and no automatic send retries."""

import asyncio
import os
from email.utils import formataddr

import httpx
from email_validator import EmailNotValidError, validate_email


SMTP2GO_SEND_URL = "https://api.smtp2go.com/v3/email/send"
CONFIGURATION_ERROR = "Email delivery is not configured. Please contact the site owner."
DELIVERY_ERROR = "Email delivery is temporarily unavailable. Please try again later."


class EmailDeliveryError(RuntimeError):
    """A message safe to expose to the caller, without provider or message data."""


def _address(value):
    try:
        return validate_email(value, check_deliverability=False).normalized
    except (EmailNotValidError, TypeError):
        raise EmailDeliveryError(CONFIGURATION_ERROR) from None


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
