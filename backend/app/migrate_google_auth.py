"""Compatibility entrypoint: python -m app.migrate_google_auth."""

from app.commands.migrate_google_auth import main, migrate


if __name__ == "__main__":
    main()
