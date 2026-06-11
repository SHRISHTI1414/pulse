"""Create all Pulse tables against the configured DATABASE_URL.

Usage:
    python scripts/create_tables.py

Reads DATABASE_URL from the repo-root .env via crm-api/app/config.py.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make `crm-api/app` importable when running as a plain script.
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "crm-api"))

from app.db import engine  # noqa: E402
from app.models import Base  # noqa: E402


def main() -> None:
    print(f"Creating tables against: {engine.url.render_as_string(hide_password=True)}")
    Base.metadata.create_all(engine)
    table_names = sorted(Base.metadata.tables.keys())
    print(f"Created/verified {len(table_names)} tables:")
    for name in table_names:
        print(f"  - {name}")


if __name__ == "__main__":
    main()
