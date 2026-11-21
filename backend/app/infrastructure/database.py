import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

# Local development uses backend/.env regardless of the working directory.
# Environment variables supplied by the deployment host take precedence.
load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not SQLALCHEMY_DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is required. Set it in backend/.env for local development "
        "or in your deployment service's environment variables."
    )

# Hosted providers may supply either PostgreSQL URL spelling. Keep explicitly
# configured SQLAlchemy drivers, while making the installed psycopg2 default clear.
for prefix in ("postgres://", "postgresql://"):
    if SQLALCHEMY_DATABASE_URL.startswith(prefix):
        SQLALCHEMY_DATABASE_URL = (
            "postgresql+psycopg2://" + SQLALCHEMY_DATABASE_URL[len(prefix):]
        )
        break

database_url = make_url(SQLALCHEMY_DATABASE_URL)
connect_args = {}
if database_url.drivername in ("postgresql+psycopg2", "postgresql+psycopg"):
    if "connect_timeout" not in database_url.query:
        connect_args["connect_timeout"] = 10
elif database_url.drivername == "postgresql+pg8000":
    if "timeout" not in database_url.query:
        connect_args["timeout"] = 10

# Discard stale connections after the database has been idle or restarted.
engine = create_engine(database_url, pool_pre_ping=True, connect_args=connect_args)

# Set up a session factory for database sessions.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all ORM models.
Base = declarative_base()

def get_db():
    """
    Dependency function to get a database session.
    Yields a session and ensures it is closed after use.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
