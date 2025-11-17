from __future__ import annotations

import asyncio

from .db import bootstrap


def init_db() -> None:
    """Synchronous entry point for database initialization tooling."""
    path = asyncio.run(bootstrap())
    print(f"database initialized at {path}")
