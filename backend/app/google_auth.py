"""Google authorization-code sign-in with explicit, browser-bound account linking."""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime, timedelta
from urllib.parse import urlencode, urlsplit

import httpx
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.auth import verify_password
from app.auth_sessions import issue_session, normalized_email, require_username, user_by_email, username_status
from app.database import get_db
from app.models import GoogleAuthFlow, GoogleAuthTicket, GoogleIdentity, LoginEvent, User, UserSession

router = APIRouter()
COOKIE_NAME = "tm_google_browser"
COOKIE_PATH = "/auth/google"
LIFETIME = timedelta(minutes=10)


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def application_origin(configured, setting_name):
    configured = configured.strip().rstrip("/")
    parsed = urlsplit(configured)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
        raise RuntimeError(f"{setting_name} must be an http(s) application origin.")
    if parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise RuntimeError(f"{setting_name} must contain an origin only, without a path or query.")
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise RuntimeError(f"{setting_name} must use HTTPS outside localhost.")
    return configured


def frontend_origin():
    for setting_name in ("FRONTEND_URL", "RENDER_EXTERNAL_URL"):
        configured = os.getenv(setting_name, "").strip()
        if configured:
            return application_origin(configured, setting_name)
    return "http://localhost:3000"


def google_settings():
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    redirect = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
    if not redirect:
        render_url = os.getenv("RENDER_EXTERNAL_URL", "").strip()
        backend_origin = application_origin(render_url, "RENDER_EXTERNAL_URL") if render_url else "http://localhost:8000"
        redirect = f"{backend_origin}/auth/google/callback/"
    parsed = urlsplit(redirect)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
        raise RuntimeError("GOOGLE_REDIRECT_URI must be an http(s) callback URL.")
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise RuntimeError("GOOGLE_REDIRECT_URI must use HTTPS outside localhost.")
    if parsed.query or parsed.fragment:
        raise RuntimeError("GOOGLE_REDIRECT_URI cannot include a query or fragment.")
    return client_id, secret, redirect


def require_google():
    settings = google_settings()
    if not settings[0] or not settings[1]:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured yet. Please use email and password.")
    return settings


def require_frontend(request):
    # A JSON request + exact Origin + unguessable browser-bound ticket protects
    # these credential-bearing operations from cross-site submission.
    if request.headers.get("origin") != frontend_origin():
        raise HTTPException(status_code=403, detail="Please continue Google sign-in from TalentMatch.")


def browser_secret(request):
    value = request.cookies.get(COOKIE_NAME, "")
    if not 32 <= len(value) <= 128:
        raise HTTPException(status_code=400, detail="Your Google sign-in session has expired. Please try again.")
    return value


def clear_browser_cookie(response):
    response.delete_cookie(COOKIE_NAME, path=COOKIE_PATH, httponly=True, samesite=cookie_same_site(),
                           secure=google_settings()[2].startswith("https://"))


def cookie_same_site():
    setting = os.getenv("GOOGLE_COOKIE_SAMESITE", "lax").strip().lower()
    if setting not in ("lax", "none"):
        raise RuntimeError("GOOGLE_COOKIE_SAMESITE must be lax or none.")
    if setting == "none" and not google_settings()[2].startswith("https://"):
        raise RuntimeError("Cross-site Google cookies require an HTTPS callback.")
    return setting


def popup_response(payload, clear_cookie=False):
    nonce = secrets.token_urlsafe(24)
    # Escape characters with special meaning in an HTML script element. No
    # credentials are placed in redirects, URL fragments, or browser history.
    message = json.dumps({"type": "talentmatch:google-auth", **payload}).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    origin = json.dumps(frontend_origin())
    html = f'''<!doctype html><html><head><meta charset="utf-8"><title>Continue to TalentMatch</title></head>
<body><p id="status">Finishing Google sign-in…</p><script nonce="{nonce}">
if (window.opener) {{ window.opener.postMessage({message}, {origin}); window.close(); }}
else {{ document.getElementById("status").textContent = "Return to TalentMatch and start Google sign-in again."; }}
</script></body></html>'''
    response = HTMLResponse(html, headers={
        "Cache-Control": "no-store", "Pragma": "no-cache", "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": f"default-src 'none'; script-src 'nonce-{nonce}'; base-uri 'none'; frame-ancestors 'none'",
        "Cross-Origin-Opener-Policy": "unsafe-none",
    })
    if clear_cookie:
        clear_browser_cookie(response)
    return response


def account_fingerprint(user):
    # Stale confirmation cannot link after an email, password, or verification change.
    return digest(json.dumps([user.id, normalized_email(user.email), user.hashed_password, bool(user.email_verified)]))


def verify_google_identity(raw_token, expected_nonce_hash):
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import id_token

    class TimedRequest(GoogleRequest):
        def __call__(self, *args, **kwargs):
            kwargs["timeout"] = 10
            return super().__call__(*args, **kwargs)

    client_id, _, _ = require_google()
    claims = id_token.verify_oauth2_token(raw_token, TimedRequest(), audience=client_id)
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("Invalid Google issuer")
    if claims.get("aud") != client_id or not isinstance(claims.get("exp"), (int, float)) or claims["exp"] <= time.time():
        raise ValueError("Invalid Google token audience or expiry")
    if claims.get("azp") not in (None, client_id):
        raise ValueError("Invalid authorized party")
    nonce = claims.get("nonce")
    if not isinstance(nonce, str) or not hmac.compare_digest(digest(nonce), expected_nonce_hash):
        raise ValueError("Invalid Google nonce")
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject or len(subject) > 255:
        raise ValueError("Invalid Google subject")
    if claims.get("email_verified") is not True:
        raise ValueError("Google email must be verified")
    email = claims.get("email")
    if not isinstance(email, str) or len(email) > 320:
        raise ValueError("Invalid Google email")
    try:
        email = validate_email(email, check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise ValueError("Invalid Google email") from exc
    authoritative = email.endswith("@gmail.com") or bool(claims.get("hd"))
    return {"subject": subject, "email": email, "authoritative": authoritative}


async def exchange_code(code, verifier):
    client_id, secret, redirect = require_google()
    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.post("https://oauth2.googleapis.com/token", data={
            "client_id": client_id, "client_secret": secret, "redirect_uri": redirect,
            "code": code, "code_verifier": verifier, "grant_type": "authorization_code",
        })
        response.raise_for_status()
        raw_token = response.json().get("id_token")
        if not isinstance(raw_token, str):
            raise ValueError("Missing Google ID token")
        return raw_token


@router.get("/auth/google/config/")
def config(response: Response):
    client_id, secret, _ = google_settings()
    response.headers["Cache-Control"] = "no-store"
    return {"enabled": bool(client_id and secret)}


@router.get("/auth/username-availability/")
def username_availability(response: Response, username: str = Query(..., max_length=100), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return username_status(db, username)


@router.get("/auth/google/start/")
def start(request: Request, remember: bool = False, db: Session = Depends(get_db)):
    client_id, _, redirect = require_google()
    state, binding, verifier, nonce = (secrets.token_urlsafe(32) for _ in range(4))
    now = datetime.utcnow()
    # Only temporary, expired authentication artifacts are removed here.
    db.query(GoogleAuthFlow).filter(GoogleAuthFlow.expires_at < now).delete(synchronize_session=False)
    db.query(GoogleAuthTicket).filter(GoogleAuthTicket.expires_at < now).delete(synchronize_session=False)
    db.add(GoogleAuthFlow(state_hash=digest(state), browser_hash=digest(binding), code_verifier=verifier,
                          nonce_hash=digest(nonce), remember=remember, expires_at=now + LIFETIME))
    db.commit()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    params = {"client_id": client_id, "redirect_uri": redirect, "response_type": "code",
              "scope": "openid email", "state": state, "nonce": nonce,
              "code_challenge": challenge, "code_challenge_method": "S256", "prompt": "select_account"}
    response = RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params), status_code=302)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.set_cookie(COOKIE_NAME, binding, max_age=int(LIFETIME.total_seconds()), path=COOKIE_PATH,
                        secure=redirect.startswith("https://"), httponly=True, samesite=cookie_same_site())
    return response


def prepare_identity(db, identity, binding, remember):
    existing = db.query(GoogleIdentity).filter(GoogleIdentity.subject == identity["subject"]).first()
    if existing:
        return db.get(User, existing.user_id), None
    user = user_by_email(db, identity["email"])
    if user and db.query(GoogleIdentity.id).filter(GoogleIdentity.user_id == user.id).first():
        raise HTTPException(status_code=409, detail="This TalentMatch account is linked to a different Google account. Use that Google account or your password.")
    if user and not identity["authoritative"] and not user.hashed_password:
        raise HTTPException(status_code=409, detail="Sign in to your existing account before connecting this Google email.")
    raw_ticket = secrets.token_urlsafe(32)
    ticket = GoogleAuthTicket(token_hash=digest(raw_ticket), browser_hash=digest(binding),
        kind="link" if user else "signup", subject=identity["subject"], email=identity["email"],
        authoritative_email=identity["authoritative"], target_user_id=user.id if user else None,
        account_fingerprint=account_fingerprint(user) if user else None, remember=remember,
        expires_at=datetime.utcnow()+LIFETIME)
    db.add(ticket)
    db.commit()
    result = {"status": "link_required" if user else "signup_required", "ticket": raw_ticket, "email": identity["email"]}
    if user:
        result["requires_password"] = not identity["authoritative"]
        result["replaces_unverified_password"] = bool(not user.email_verified and identity["authoritative"])
    return None, result


@router.get("/auth/google/callback/")
async def callback(request: Request, state: str = "", code: str = "", error: str = "", db: Session = Depends(get_db)):
    try:
        binding = browser_secret(request)
        if not 32 <= len(state) <= 128:
            raise HTTPException(status_code=400, detail="Google sign-in expired. Please try again.")
        flow = db.query(GoogleAuthFlow).filter(GoogleAuthFlow.state_hash == digest(state)).with_for_update().first()
        if not flow or flow.consumed_at or flow.expires_at < datetime.utcnow() or not hmac.compare_digest(flow.browser_hash, digest(binding)):
            raise HTTPException(status_code=400, detail="Google sign-in expired. Please try again.")
        flow.consumed_at = datetime.utcnow()
        verifier, nonce_hash, remember = flow.code_verifier, flow.nonce_hash, flow.remember
        # Consume state before exchanging the one-time code, including cancellation.
        flow.code_verifier = ""
        db.commit()
        if error or not code or len(code) > 4096:
            return popup_response({"status": "error", "message": "Google sign-in was cancelled. You can try again."}, clear_cookie=True)
        raw_token = await exchange_code(code, verifier)
        identity = await run_in_threadpool(verify_google_identity, raw_token, nonce_hash)
        user, pending = prepare_identity(db, identity, binding, remember)
        if user:
            auth = issue_session(user, request, db, remember)
            return popup_response({"status": "success", "auth": auth, "remember": remember}, clear_cookie=True)
        return popup_response(pending)
    except HTTPException as exc:
        db.rollback()
        return popup_response({"status": "error", "message": exc.detail}, clear_cookie=True)
    except Exception:
        db.rollback()
        # Never echo Google responses, authorization codes, or tokens into logs/HTML.
        return popup_response({"status": "error", "message": "Google sign-in could not be verified. Please try again."}, clear_cookie=True)


class TicketRequest(BaseModel):
    ticket: str = Field(min_length=32, max_length=128)


class SignupRequest(TicketRequest):
    username: str = Field(min_length=1, max_length=100)


class LinkRequest(TicketRequest):
    confirm: bool
    password: str | None = Field(default=None, max_length=256)


def locked_ticket(db, request, raw_ticket, expected_kind=None):
    require_frontend(request)
    binding = browser_secret(request)
    ticket = db.query(GoogleAuthTicket).filter(GoogleAuthTicket.token_hash == digest(raw_ticket)).with_for_update().first()
    if (not ticket or ticket.consumed_at or ticket.expires_at < datetime.utcnow()
            or not hmac.compare_digest(ticket.browser_hash, digest(binding))
            or (expected_kind is not None and ticket.kind != expected_kind)):
        raise HTTPException(status_code=400, detail="This Google sign-in request expired. Please start again.")
    return ticket


@router.post("/auth/google/signup/")
def complete_signup(body: SignupRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ticket = locked_ticket(db, request, body.ticket, "signup")
    username = require_username(db, body.username)
    if user_by_email(db, ticket.email) or db.query(GoogleIdentity.id).filter(GoogleIdentity.subject == ticket.subject).first():
        raise HTTPException(status_code=409, detail="An account already exists. Please start Google sign-in again to link it.")
    user = User(username=username, email=ticket.email, hashed_password=None, email_verified=ticket.authoritative_email)
    try:
        db.add(user)
        db.flush()
        db.add(GoogleIdentity(user_id=user.id, subject=ticket.subject))
        ticket.consumed_at = datetime.utcnow()
        auth = issue_session(user, request, db, ticket.remember, commit=False)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That username or account was just registered. Choose another username or restart Google sign-in.")
    response.headers["Cache-Control"] = "no-store"
    clear_browser_cookie(response)
    return auth


@router.post("/auth/google/link/")
def confirm_link(body: LinkRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ticket = locked_ticket(db, request, body.ticket, "link")
    if body.confirm is not True:
        ticket.consumed_at = datetime.utcnow()
        db.commit()
        clear_browser_cookie(response)
        return {"cancelled": True}
    user = db.query(User).filter(User.id == ticket.target_user_id).with_for_update().first()
    if not user or not hmac.compare_digest(ticket.account_fingerprint or "", account_fingerprint(user)):
        raise HTTPException(status_code=409, detail="Your account changed. Please start Google sign-in again.")
    if db.query(GoogleIdentity.id).filter((GoogleIdentity.subject == ticket.subject) | (GoogleIdentity.user_id == user.id)).first():
        raise HTTPException(status_code=409, detail="This account has already been linked. Please start Google sign-in again.")
    if not ticket.authoritative_email and not verify_password(body.password or "", user.hashed_password):
        ticket.failed_attempts += 1
        if ticket.failed_attempts >= 5:
            ticket.consumed_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=400, detail="The current account password is incorrect." if ticket.failed_attempts < 5 else "Too many attempts. Please start Google sign-in again.")
    # An attacker may have preregistered someone else's email. Google must be
    # authoritative before reclaiming such an account; old credentials cannot survive.
    if ticket.authoritative_email and not user.email_verified:
        user.hashed_password = None
        user.clear_reset_token()
        db.query(LoginEvent).filter(LoginEvent.user_id == user.id).update({"active": False}, synchronize_session=False)
        db.query(UserSession).filter(UserSession.user_id == user.id).update({"revoked": True}, synchronize_session=False)
    if ticket.authoritative_email:
        user.email_verified = True
        user.email_verification_code = None
        user.email_verification_expires_at = None
    try:
        db.add(GoogleIdentity(user_id=user.id, subject=ticket.subject))
        ticket.consumed_at = datetime.utcnow()
        auth = issue_session(user, request, db, ticket.remember, commit=False)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This account was just linked. Please sign in again.")
    response.headers["Cache-Control"] = "no-store"
    clear_browser_cookie(response)
    return auth


@router.post("/auth/google/cancel/")
def cancel(body: TicketRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    ticket = locked_ticket(db, request, body.ticket)
    ticket.consumed_at = datetime.utcnow()
    db.commit()
    clear_browser_cookie(response)
    response.headers["Cache-Control"] = "no-store"
    return {"cancelled": True}
