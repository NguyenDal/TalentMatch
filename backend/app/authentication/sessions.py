"""Shared session issuance for password and Google authentication."""

import os
import re
import secrets
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.infrastructure.database import get_db
from app.models import GoogleIdentity, LoginEvent, User, UserSession

ALGORITHM = "HS256"
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,30}$")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


def revoke_user_sessions(db, user_id):
    """Invalidate current and legacy session records within the caller's transaction."""
    db.query(UserSession).filter(UserSession.user_id == user_id).update(
        {"revoked": True}, synchronize_session=False
    )
    db.query(LoginEvent).filter(LoginEvent.user_id == user_id).update(
        {"active": False}, synchronize_session=False
    )


def signing_secret():
    secret = os.getenv("SECRET_KEY", "")
    if len(secret) < 32:
        raise RuntimeError("SECRET_KEY must be configured with at least 32 random characters.")
    return secret


def normalized_email(email):
    return email.strip().lower()


def user_by_email(db, email):
    return db.query(User).filter(func.lower(func.trim(User.email)) == normalized_email(email)).first()


def username_status(db, username):
    username = username.strip()
    if not USERNAME_PATTERN.fullmatch(username):
        return {"valid": False, "available": False, "message": "Use 3–30 letters, numbers, or underscores."}
    exists = db.query(User.id).filter(func.lower(func.trim(User.username)) == username.lower()).first()
    return {
        "valid": True,
        "available": exists is None,
        "message": "Username is available." if exists is None else "This username is already taken.",
    }


def require_username(db, username):
    status = username_status(db, username)
    if not status["valid"]:
        raise HTTPException(status_code=400, detail=status["message"])
    if not status["available"]:
        raise HTTPException(status_code=409, detail=status["message"])
    return username.strip()


def validate_password(password):
    if len(password) < 8 or len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Use a password with at least 8 characters and at most 72 UTF-8 bytes.")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    return authenticated_user(token, db)


def get_current_user_locked(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    # Credential mutations must recheck session revocation *after* obtaining the
    # same user lock held by account-link confirmation.
    return authenticated_user(token, db, locked=True)


def authenticated_user(token, db, locked=False):
    error = HTTPException(status_code=401, detail="Could not validate credentials",
                          headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, signing_secret(), algorithms=[ALGORITHM],
                             options={"require_exp": True, "require_sub": True})
        user_id, sid = payload.get("user_id"), payload.get("sid")
        if not isinstance(user_id, int) or not isinstance(sid, str) or not sid:
            raise error
        user_query = db.query(User).filter(User.id == user_id)
        if locked:
            user_query = user_query.with_for_update().populate_existing()
        user = user_query.first()
        session = db.query(LoginEvent).filter(LoginEvent.user_id == user_id,
            LoginEvent.session_id == sid, LoginEvent.active.is_(True)).first()
        if not user or not session:
            raise error
        return user
    except JWTError:
        raise error


def set_initial_password(db, user_id, password):
    from app.authentication.passwords import hash_password
    validate_password(password)
    user = db.query(User).filter(User.id == user_id).with_for_update().populate_existing().first()
    if not user or not db.query(GoogleIdentity.id).filter(GoogleIdentity.user_id == user_id).first():
        raise HTTPException(status_code=400, detail="Password setup is available for Google accounts.")
    if user.hashed_password:
        raise HTTPException(status_code=409, detail="A password is already set. Use Change password instead.")
    user.hashed_password = hash_password(password)
    user.clear_reset_token()
    db.commit()
    return {"ok": True, "has_password": True, "message": "Password set. You can now sign in with Google or your password."}


def issue_session(user, request, db, remember=False, location="Location unavailable", commit=True):
    session_id = secrets.token_urlsafe(32)
    expiry = datetime.utcnow() + timedelta(days=30 if remember else 1)
    payload = {
        "sub": user.username, "user_id": user.id, "email": user.email,
        "username": user.username, "sid": session_id, "exp": expiry,
    }
    token = jwt.encode(payload, signing_secret(), algorithm=ALGORITHM)
    # The ASGI server resolves forwarding headers only for trusted proxies.
    # Application code must not independently trust client-supplied headers.
    client_ip = request.client.host if request.client else "Unknown"
    db.add(LoginEvent(user_id=user.id, ip=client_ip[:45],
                      user_agent=request.headers.get("user-agent", "Unknown device"),
                      location=location, session_id=session_id, active=True))
    if commit:
        db.commit()
    return {"access_token": token, "token_type": "bearer", "user_id": user.id,
            "username": user.username, "email": user.email, "remember": remember}
