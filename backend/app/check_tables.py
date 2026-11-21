"""Compatibility entrypoint: python -m app.check_tables."""

from app.commands.check_tables import check_database, main


if __name__ == "__main__":
    raise SystemExit(main())
