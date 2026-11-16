"""Read-only schema and row-count verification for the configured database.

Run from backend with: python -m app.check_tables
"""

import sys

from sqlalchemy import func, inspect, select
from sqlalchemy.exc import SQLAlchemyError


def check_database(engine, metadata):
    """Return whether all expected tables and columns exist; print counts only."""
    valid = True
    with engine.connect() as connection:
        inspector = inspect(connection)
        actual_tables = set(inspector.get_table_names())
        for table in metadata.sorted_tables:
            if table.name not in actual_tables:
                print(f"MISSING table: {table.name}")
                valid = False
                continue

            actual_columns = {
                column["name"] for column in inspector.get_columns(table.name)
            }
            missing_columns = set(table.columns.keys()) - actual_columns
            count = connection.scalar(select(func.count()).select_from(table))
            print(f"{table.name}: {count} rows")
            if missing_columns:
                print(
                    f"MISSING columns in {table.name}: "
                    + ", ".join(sorted(missing_columns))
                )
                valid = False

    print("Schema check passed." if valid else "Schema check failed.")
    return valid


def main():
    try:
        from app.database import Base, engine
        from app import models  # noqa: F401 — register the expected ORM tables

        return 0 if check_database(engine, Base.metadata) else 1
    except (SQLAlchemyError, RuntimeError):
        # Driver errors can include credentials or connection details. Keep the
        # command's output safe to share while signaling failure to the caller.
        print(
            "Database check failed. Verify DATABASE_URL, network access, TLS "
            "settings, and database permissions.",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
