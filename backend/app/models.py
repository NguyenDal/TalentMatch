from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, Index, func
from app.infrastructure.database import Base
from datetime import datetime, timedelta
import hashlib
import secrets


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    # Google-first accounts do not have a password until their owner sets one.
    hashed_password = Column(String, nullable=True)

    profile_image_url = Column(String, nullable=True)
    profession = Column(String, nullable=True)
    bio = Column(String, nullable=True)

    reset_token = Column(String, unique=True, nullable=True, index=True)
    reset_token_expiration = Column(DateTime, nullable=True)

    # FIELDS FOR ACCOUNT SETTINGS / EMAIL VERIFICATION
    email_verified = Column(Boolean, default=False, nullable=False)
    email_verification_code = Column(String, nullable=True)
    email_verification_expires_at = Column(DateTime, nullable=True)

    def generate_reset_token(self, expires_in=3600):
        token = secrets.token_urlsafe(32)
        self.reset_token = self.reset_token_digest(token)
        self.reset_token_expiration = datetime.utcnow() + timedelta(seconds=expires_in)
        return token

    @staticmethod
    def reset_token_digest(token):
        return hashlib.sha256(token.encode("ascii")).hexdigest()

    def verify_reset_token(self, token):
        if not self.reset_token or len(token) != 43 or not token.isascii():
            return False
        expected = self.reset_token_digest(token) if len(self.reset_token) == 64 else token
        return (
            secrets.compare_digest(self.reset_token, expected)
            and self.reset_token_expiration is not None
            and datetime.utcnow() < self.reset_token_expiration
        )

    def clear_reset_token(self):
        self.reset_token = None
        self.reset_token_expiration = None

    # HELPER: generate email verification code
    def generate_email_verification_code(self, expires_in_minutes: int = 20):
        code = f"{secrets.randbelow(1_000_000):06d}"  # 6-digit zero-padded
        self.email_verification_code = code
        self.email_verification_expires_at = datetime.utcnow() + timedelta(
            minutes=expires_in_minutes
        )
        self.email_verified = False
        return code

class LoginEvent(Base):
    __tablename__ = "login_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    # When this login happened
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Basic device info
    ip = Column(String(45))
    user_agent = Column(Text)
    location = Column(String(255))

    # Session info
    session_id = Column(String, nullable=False, unique=True)
    active = Column(Boolean, default=True, nullable=False)

class UserSession(Base):
    """
    Tracks active login sessions so we can:
      - show only active sessions in 'Recent logins'
      - remotely revoke a specific session
      - reject requests from revoked/expired sessions
    """
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    # Random identifier for this session (stored in JWT as 'sid')
    session_id = Column(String, unique=True, index=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)

    revoked = Column(Boolean, default=False, nullable=False)

    # Optional device info
    ip = Column(String(45))
    user_agent = Column(Text)
    location = Column(String(255))


# Case-insensitive uniqueness also protects concurrent registrations.
Index("uq_users_username_normalized", func.lower(func.trim(User.username)), unique=True)
Index("uq_users_email_normalized", func.lower(func.trim(User.email)), unique=True)


class GoogleIdentity(Base):
    __tablename__ = "google_identities"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    subject = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class GoogleAuthFlow(Base):
    __tablename__ = "google_auth_flows"

    state_hash = Column(String(64), primary_key=True)
    browser_hash = Column(String(64), nullable=False)
    code_verifier = Column(String(128), nullable=False)
    nonce_hash = Column(String(64), nullable=False)
    remember = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    consumed_at = Column(DateTime, nullable=True)


class GoogleAuthTicket(Base):
    __tablename__ = "google_auth_tickets"

    token_hash = Column(String(64), primary_key=True)
    browser_hash = Column(String(64), nullable=False)
    kind = Column(String(10), nullable=False)
    subject = Column(String(255), nullable=False)
    email = Column(String(320), nullable=False)
    authoritative_email = Column(Boolean, nullable=False)
    target_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    account_fingerprint = Column(String(64), nullable=True)
    remember = Column(Boolean, nullable=False, default=False)
    failed_attempts = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime, nullable=False, index=True)
    consumed_at = Column(DateTime, nullable=True)
