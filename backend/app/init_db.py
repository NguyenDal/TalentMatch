"""Compatibility entrypoint: python -m app.init_db."""

from app.commands.init_db import main


if __name__ == "__main__":
    main()
