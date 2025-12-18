from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from app.database import Base
from datetime import datetime, timedelta
import secrets


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)

    profile_image_url = Column(String, nullable=True)
    profession = Column(String, nullable=True)
    bio = Column(String, nullable=True)

    reset_token = Column(String, unique=True, nullable=True, index=True)
    reset_token_expiration = Column(DateTime, nullable=True)

    # FIELDS FOR ACCOUNT SETTINGS / EMAIL VERIFICATION
    email_verified = Column(Boolean, default=False, nullable=False)
    email_verification_code = Column(String, nullable=True)
    email_verification_expires_at = Column(DateTime, nullable=True)

    @property
    def full_name(self) -> str:
        parts = [self.first_name or "", self.last_name or ""]
        return " ".join([p for p in parts if p]).strip()

    def generate_reset_token(self, expires_in=3600):
        self.reset_token = secrets.token_urlsafe(32)
        self.reset_token_expiration = datetime.utcnow() + timedelta(seconds=expires_in)

    def verify_reset_token(self, token):
        return (
            self.reset_token == token
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