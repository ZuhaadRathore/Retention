"""Database migration infrastructure for Retention."""
from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, List, Optional
import aiosqlite

# Current schema version - increment this when adding new migrations
CURRENT_SCHEMA_VERSION = 1


class Migration:
    """Represents a single database migration."""

    def __init__(
        self,
        version: int,
        description: str,
        up: Callable[[aiosqlite.Connection], None],
        down: Optional[Callable[[aiosqlite.Connection], None]] = None
    ):
        self.version = version
        self.description = description
        self.up = up
        self.down = down


# Migration definitions
MIGRATIONS: List[Migration] = [
    # Migration 1: Initial schema (baseline)
    Migration(
        version=1,
        description="Initial schema - baseline migration",
        up=lambda conn: None,  # No-op, schema already created in db.py
        down=None
    ),
]


class MigrationManager:
    """Manages database migrations and schema versioning."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.backup_dir = db_path.parent / "backups"

    async def initialize_version_table(self, conn: aiosqlite.Connection) -> None:
        """Create the schema_version table if it doesn't exist."""
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                description TEXT NOT NULL,
                applied_at TEXT NOT NULL
            )
        """)
        await conn.commit()

    async def get_current_version(self, conn: aiosqlite.Connection) -> int:
        """Get the current schema version from the database."""
        cursor = await conn.execute(
            "SELECT MAX(version) FROM schema_version"
        )
        row = await cursor.fetchone()
        version = row[0] if row and row[0] is not None else 0
        return version

    async def create_backup(self) -> Path:
        """Create a backup of the database before running migrations."""
        if not self.db_path.exists():
            raise FileNotFoundError(f"Database not found: {self.db_path}")

        # Create backup directory
        self.backup_dir.mkdir(parents=True, exist_ok=True)

        # Generate backup filename with timestamp
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        backup_path = self.backup_dir / f"retention_backup_{timestamp}.sqlite"

        # Copy database file
        shutil.copy2(self.db_path, backup_path)

        # Also copy WAL and SHM files if they exist
        wal_path = Path(str(self.db_path) + "-wal")
        shm_path = Path(str(self.db_path) + "-shm")

        if wal_path.exists():
            shutil.copy2(wal_path, Path(str(backup_path) + "-wal"))
        if shm_path.exists():
            shutil.copy2(shm_path, Path(str(backup_path) + "-shm"))

        # Clean up old backups (keep last 10)
        await self._cleanup_old_backups(keep=10)

        return backup_path

    async def _cleanup_old_backups(self, keep: int = 10) -> None:
        """Remove old backup files, keeping only the most recent ones."""
        if not self.backup_dir.exists():
            return

        backups = sorted(
            self.backup_dir.glob("retention_backup_*.sqlite"),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )

        # Remove backups beyond the keep limit
        for backup in backups[keep:]:
            try:
                backup.unlink()
                # Also remove WAL and SHM files
                wal_file = Path(str(backup) + "-wal")
                shm_file = Path(str(backup) + "-shm")
                if wal_file.exists():
                    wal_file.unlink()
                if shm_file.exists():
                    shm_file.unlink()
            except Exception:
                pass  # Ignore errors when cleaning up old backups

    async def run_migrations(self, conn: aiosqlite.Connection) -> List[str]:
        """
        Run all pending migrations.

        Returns a list of descriptions of migrations that were applied.
        """
        await self.initialize_version_table(conn)
        current_version = await self.get_current_version(conn)

        # Find migrations that need to be run
        pending_migrations = [
            m for m in MIGRATIONS
            if m.version > current_version
        ]

        if not pending_migrations:
            return []

        # Create backup before running migrations
        backup_path = await self.create_backup()
        applied: List[str] = []

        try:
            for migration in sorted(pending_migrations, key=lambda m: m.version):
                # Run the migration
                await migration.up(conn)

                # Record the migration in schema_version table
                timestamp = datetime.now(timezone.utc).isoformat()
                await conn.execute(
                    """
                    INSERT INTO schema_version (version, description, applied_at)
                    VALUES (?, ?, ?)
                    """,
                    (migration.version, migration.description, timestamp)
                )
                await conn.commit()

                applied.append(f"v{migration.version}: {migration.description}")

            return applied

        except Exception as e:
            # If migration fails, log the error and backup path for recovery
            raise RuntimeError(
                f"Migration failed: {e}. "
                f"Database backup available at: {backup_path}"
            ) from e

    async def get_migration_history(self, conn: aiosqlite.Connection) -> List[dict]:
        """Get the history of applied migrations."""
        await self.initialize_version_table(conn)
        cursor = await conn.execute(
            "SELECT version, description, applied_at FROM schema_version ORDER BY version"
        )
        rows = await cursor.fetchall()
        return [
            {
                "version": row[0],
                "description": row[1],
                "applied_at": row[2]
            }
            for row in rows
        ]


async def run_migrations(db_path: Path) -> List[str]:
    """
    Convenience function to run migrations on a database.

    Returns a list of descriptions of migrations that were applied.
    """
    manager = MigrationManager(db_path)
    conn = await aiosqlite.connect(db_path)
    try:
        return await manager.run_migrations(conn)
    finally:
        await conn.close()
