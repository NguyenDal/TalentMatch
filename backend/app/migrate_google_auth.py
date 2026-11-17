"""Prepare PostgreSQL for Google sign-in without merging or deleting accounts.

Run from backend: python -m app.migrate_google_auth
The only removed personal data is the explicitly retired first_name/last_name.
"""

from sqlalchemy import inspect, text

from app.database import Base, engine
from app import models  # Register all tables and indexes with Base.


def migrate(connection):
    if connection.dialect.name != "postgresql":
        raise RuntimeError("This migration targets PostgreSQL. Tests use a separate fresh SQLite schema.")
    if inspect(connection).has_table("users"):
        # Serialize this migration with concurrent application writes while the
        # preflight checks and uniqueness indexes are installed atomically.
        connection.execute(text("LOCK TABLE users IN ACCESS EXCLUSIVE MODE"))
        for field in ("username", "email"):
            duplicate_groups = connection.execute(text(
                f"SELECT count(*) FROM (SELECT lower(trim({field})) FROM users "
                f"GROUP BY lower(trim({field})) HAVING count(*) > 1) AS duplicates"
            )).scalar_one()
            if duplicate_groups:
                raise RuntimeError(
                    f"Cannot migrate: {duplicate_groups} case-insensitive {field} collision(s). "
                    "Resolve them explicitly; no accounts have been changed."
                )
        connection.execute(text("ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL"))
        connection.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS first_name"))
        connection.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS last_name"))
    Base.metadata.create_all(connection)
    # create_all skips indexes on an existing table; install these explicitly.
    for index in models.User.__table__.indexes:
        if index.name in ("uq_users_username_normalized", "uq_users_email_normalized"):
            index.create(connection, checkfirst=True)


def main():
    with engine.begin() as connection:
        migrate(connection)
    print("Google auth schema ready; first_name and last_name removed. Existing accounts retained.")


if __name__ == "__main__":
    main()
