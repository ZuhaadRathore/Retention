from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

import aiosqlite

from .models import (
    AttemptRecord,
    CardIn,
    CardRecord,
    DeckIn,
    DeckRecord,
    DeckUpdate,
    ScoreRequest,
    ScoreResult,
    Verdict
)
from .migrations import MigrationManager


def _default_data_dir() -> Path:
    override = os.getenv("RETENTION_DATA_DIR")
    if override:
        return Path(override).expanduser()

    if sys.platform == "win32":
        base = os.getenv("LOCALAPPDATA")
        root = Path(base) if base else Path.home() / "AppData" / "Local"
    elif sys.platform == "darwin":
        root = Path.home() / "Library" / "Application Support"
    else:
        base = os.getenv("XDG_DATA_HOME")
        root = Path(base) if base else Path.home() / ".local" / "share"

    return root / "Retention"


DATA_DIR = _default_data_dir()
DB_PATH = DATA_DIR / "retention.sqlite"

SCHEMA = """
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS decks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    keypoints TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    alternative_answers TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_answer TEXT NOT NULL,
    verdict TEXT NOT NULL,
    score REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    payload TEXT
);
"""

# Security limits for bulk operations
MAX_BULK_CARDS = 500  # Conservative limit below SQLite's default 999 parameter limit
MAX_ID_LENGTH = 100   # Maximum length for UUID/ID strings


def _validate_card_ids(card_ids: List[str], max_count: int = MAX_BULK_CARDS) -> None:
    """
    Validate card ID array for security and integrity.

    Raises ValueError if validation fails.
    """
    if not card_ids:
        raise ValueError("card_ids cannot be empty")

    if len(card_ids) > max_count:
        raise ValueError(f"Too many cards: {len(card_ids)} exceeds maximum of {max_count}")

    for card_id in card_ids:
        if not isinstance(card_id, str):
            raise ValueError(f"Invalid card_id type: expected str, got {type(card_id).__name__}")

        if len(card_id) > MAX_ID_LENGTH:
            raise ValueError(f"card_id too long: {len(card_id)} exceeds maximum of {MAX_ID_LENGTH}")

        if not card_id.strip():
            raise ValueError("card_id cannot be empty or whitespace")


class Database:
    """Lazy SQLite connector used by the sidecar."""

    def __init__(self) -> None:
        self._connection: Optional[aiosqlite.Connection] = None
        self._state: str = "cold"
        self._init_lock: Optional[asyncio.Lock] = None

    async def initialize(self) -> None:
        # Lazy initialization of lock to avoid event loop issues
        if self._init_lock is None:
            self._init_lock = asyncio.Lock()

        # Prevent concurrent initialization
        async with self._init_lock:
            # If already initialized or initializing, return early
            if self._state in ("ready", "initializing"):
                return

            self._state = "initializing"
            try:
                DATA_DIR.mkdir(parents=True, exist_ok=True)
                self._connection = await aiosqlite.connect(DB_PATH)
                self._connection.row_factory = aiosqlite.Row
                await self._connection.executescript(SCHEMA)

                # Run legacy column migrations for backward compatibility
                await self._migrate_archived_column()
                await self._migrate_alternative_answers_column()

                # Run migration system
                migration_manager = MigrationManager(DB_PATH)
                applied_migrations = await migration_manager.run_migrations(self._connection)
                if applied_migrations:
                    print(f"Applied migrations: {', '.join(applied_migrations)}", flush=True)

                await self._connection.commit()
                await self._seed_if_empty()
            except Exception:
                self._state = "error"
                raise
            else:
                self._state = "ready"

    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()
            self._connection = None
        if self._state != "error":
            self._state = "closed"

    @property
    def path(self) -> Path:
        return DB_PATH

    @property
    def state(self) -> str:
        return self._state

    def _require_connection(self) -> aiosqlite.Connection:
        if self._connection is None:
            raise RuntimeError("database not initialized")
        return self._connection

    async def list_decks(self) -> List[DeckRecord]:
        conn = self._require_connection()
        cursor = await conn.execute(
            "SELECT id, title, description, updated_at FROM decks ORDER BY updated_at DESC"
        )
        rows = await cursor.fetchall()
        decks: List[DeckRecord] = []

        for row in rows:
            deck_id = row["id"]
            cards = await self._fetch_cards(deck_id)
            decks.append(
                DeckRecord(
                    id=deck_id,
                    title=row["title"],
                    description=row["description"],
                    card_count=len(cards),
                    updated_at=row["updated_at"],
                    cards=cards
                )
            )

        return decks

    async def get_deck(self, deck_id: str) -> Optional[DeckRecord]:
        conn = self._require_connection()
        cursor = await conn.execute(
            "SELECT id, title, description, updated_at FROM decks WHERE id = ?",
            (deck_id,)
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        cards = await self._fetch_cards(deck_id)
        return DeckRecord(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            card_count=len(cards),
            updated_at=row["updated_at"],
            cards=cards
        )

    async def create_deck(self, payload: DeckIn) -> DeckRecord:
        conn = self._require_connection()
        deck_id = payload.id or str(uuid4())
        timestamp = _utc_now()
        await conn.execute(
            "INSERT INTO decks (id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (deck_id, payload.title, payload.description, timestamp, timestamp)
        )
        await self._replace_cards(deck_id, payload.cards, timestamp)
        await conn.commit()
        deck = await self.get_deck(deck_id)
        assert deck is not None
        return deck

    async def update_deck(self, deck_id: str, payload: DeckUpdate) -> Optional[DeckRecord]:
        conn = self._require_connection()
        timestamp = _utc_now()

        fields = []
        values = []
        if payload.title is not None:
            fields.append("title = ?")
            values.append(payload.title)
        if payload.description is not None:
            fields.append("description = ?")
            values.append(payload.description)

        if fields:
            set_clause = ", ".join(fields + ["updated_at = ?"])
            await conn.execute(
                f"UPDATE decks SET {set_clause} WHERE id = ?",
                (*values, timestamp, deck_id)
            )
        elif payload.cards is not None:
            await conn.execute(
                "UPDATE decks SET updated_at = ? WHERE id = ?",
                (timestamp, deck_id)
            )

        if payload.cards is not None:
            await self._replace_cards(deck_id, payload.cards, timestamp)

        await conn.commit()
        return await self.get_deck(deck_id)

    async def delete_deck(self, deck_id: str) -> None:
        conn = self._require_connection()
        await conn.execute("DELETE FROM decks WHERE id = ?", (deck_id,))
        await conn.commit()

    async def record_attempt(self, request: ScoreRequest, result: ScoreResult) -> AttemptRecord:
        """Persist a study attempt and return the enriched record."""

        conn = self._require_connection()
        attempt_id = str(uuid4())
        timestamp = _utc_now()
        payload = {
            "prompt": request.prompt,
            "expected_answer": request.expected_answer,
            "keypoints": request.keypoints,
            "missing_keypoints": result.missing_keypoints,
            "feedback": result.feedback,
            "cosine": result.cosine,
            "coverage": result.coverage,
            "verdict": result.verdict.value
        }
        await conn.execute(
            """
            INSERT INTO attempts (id, card_id, user_answer, verdict, score, created_at, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                attempt_id,
                request.card_id,
                request.user_answer,
                result.verdict.value,
                result.score,
                timestamp,
                json.dumps(payload)
            )
        )
        await conn.commit()
        return AttemptRecord(
            id=attempt_id,
            card_id=request.card_id,
            user_answer=request.user_answer,
            verdict=result.verdict,
            score=result.score,
            cosine=result.cosine,
            coverage=result.coverage,
            missing_keypoints=result.missing_keypoints,
            feedback=result.feedback,
            prompt=request.prompt,
            expected_answer=request.expected_answer,
            keypoints=request.keypoints,
            created_at=timestamp
        )

    async def list_attempts(self, card_id: str, limit: int = 50) -> List[AttemptRecord]:
        conn = self._require_connection()
        cursor = await conn.execute(
            """
            SELECT id, user_answer, verdict, score, created_at, payload
            FROM attempts
            WHERE card_id = ?
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT ?
            """,
            (card_id, limit)
        )
        rows = await cursor.fetchall()
        attempts: List[AttemptRecord] = []
        for row in rows:
            payload = json.loads(row["payload"] or "{}")
            attempts.append(
                AttemptRecord(
                    id=row["id"],
                    card_id=card_id,
                    user_answer=row["user_answer"],
                    verdict=Verdict(payload.get("verdict", row["verdict"])),
                    score=float(row["score"]),
                    cosine=float(payload.get("cosine", 0.0)),
                    coverage=float(payload.get("coverage", 0.0)),
                    missing_keypoints=list(payload.get("missing_keypoints", [])),
                    feedback=payload.get("feedback"),
                    prompt=payload.get("prompt"),
                    expected_answer=payload.get("expected_answer"),
                    keypoints=list(payload.get("keypoints", [])),
                    created_at=row["created_at"]
                )
            )
        return attempts

    async def _fetch_cards(self, deck_id: str) -> List[CardRecord]:
        conn = self._require_connection()
        cursor = await conn.execute(
            """
            SELECT c.id, c.prompt, c.answer, c.keypoints, c.archived, c.alternative_answers
            FROM cards AS c
            WHERE c.deck_id = ?
            ORDER BY c.created_at
            """,
            (deck_id,)
        )
        rows = await cursor.fetchall()
        cards = []
        for row in rows:
            keypoints = json.loads(row["keypoints"]) if row["keypoints"] else []
            alternative_answers = json.loads(row["alternative_answers"]) if row["alternative_answers"] else []
            archived = bool(row["archived"]) if row["archived"] is not None else False
            cards.append(
                CardRecord(
                    id=row["id"],
                    prompt=row["prompt"],
                    answer=row["answer"],
                    keypoints=keypoints,
                    keypoint_count=len(keypoints),
                    archived=archived if archived else None,
                    alternative_answers=alternative_answers if alternative_answers else None
                )
            )
        return cards

    async def _replace_cards(self, deck_id: str, cards: List[CardIn], timestamp: str) -> None:
        conn = self._require_connection()
        await conn.execute("DELETE FROM cards WHERE deck_id = ?", (deck_id,))
        for card in cards:
            card_id = card.id or str(uuid4())
            keypoints_json = json.dumps(card.keypoints)
            archived = 1 if card.archived else 0
            alternative_answers_json = json.dumps(card.alternative_answers or [])
            await conn.execute(
                """
                INSERT INTO cards (id, deck_id, prompt, answer, keypoints, archived, alternative_answers, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (card_id, deck_id, card.prompt, card.answer, keypoints_json, archived, alternative_answers_json, timestamp, timestamp)
            )

    async def _migrate_archived_column(self) -> None:
        """Add archived column to existing cards table if it doesn't exist."""
        conn = self._require_connection()
        try:
            cursor = await conn.execute("PRAGMA table_info(cards)")
            columns = await cursor.fetchall()
            has_archived = any(col["name"] == "archived" for col in columns)
            if not has_archived:
                await conn.execute("ALTER TABLE cards ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")
        except Exception:
            # If the column already exists or any other error, continue
            pass

    async def _migrate_alternative_answers_column(self) -> None:
        """Add alternative_answers column to existing cards table if it doesn't exist."""
        conn = self._require_connection()
        try:
            cursor = await conn.execute("PRAGMA table_info(cards)")
            columns = await cursor.fetchall()
            has_alternative_answers = any(col["name"] == "alternative_answers" for col in columns)
            if not has_alternative_answers:
                await conn.execute("ALTER TABLE cards ADD COLUMN alternative_answers TEXT NOT NULL DEFAULT '[]'")
        except Exception:
            # If the column already exists or any other error, continue
            pass

    async def bulk_update_cards(self, deck_id: str, card_ids: List[str], operation: str) -> Optional[DeckRecord]:
        """Apply bulk operations to multiple cards in a deck."""
        from .models import BulkOperationType

        # Security: Validate input before processing
        try:
            _validate_card_ids(card_ids)
        except ValueError as e:
            raise ValueError(f"Invalid card_ids: {e}")

        conn = self._require_connection()
        timestamp = _utc_now()

        # Verify all cards belong to this deck
        # Security: Using validated card_ids with parameterized query
        placeholders = ",".join("?" * len(card_ids))
        cursor = await conn.execute(
            f"SELECT id FROM cards WHERE deck_id = ? AND id IN ({placeholders})",
            (deck_id, *card_ids)
        )
        valid_cards = [row["id"] for row in await cursor.fetchall()]

        if not valid_cards:
            return None

        # Perform the operation
        if operation == BulkOperationType.archive:
            # Archive cards
            # Security: Using validated valid_cards with parameterized query
            placeholders = ",".join("?" * len(valid_cards))
            await conn.execute(
                f"UPDATE cards SET archived = 1, updated_at = ? WHERE id IN ({placeholders})",
                (timestamp, *valid_cards)
            )
        elif operation == BulkOperationType.unarchive:
            # Unarchive cards
            # Security: Using validated valid_cards with parameterized query
            placeholders = ",".join("?" * len(valid_cards))
            await conn.execute(
                f"UPDATE cards SET archived = 0, updated_at = ? WHERE id IN ({placeholders})",
                (timestamp, *valid_cards)
            )
        elif operation == BulkOperationType.mark_learned:
            # Mark as learned - archive the cards
            placeholders = ",".join("?" * len(valid_cards))
            await conn.execute(
                f"UPDATE cards SET archived = 1, updated_at = ? WHERE id IN ({placeholders})",
                (timestamp, *valid_cards)
            )

        # Update deck timestamp
        await conn.execute(
            "UPDATE decks SET updated_at = ? WHERE id = ?",
            (timestamp, deck_id)
        )

        await conn.commit()
        return await self.get_deck(deck_id)

    async def _seed_if_empty(self) -> None:
        conn = self._require_connection()
        cursor = await conn.execute("SELECT COUNT(*) FROM decks")
        (count,) = await cursor.fetchone()
        if count:
            return

        await self.create_deck(
            DeckIn(
                id="deck-chemistry",
                title="Organic Chemistry Basics",
                description="Functional groups and reaction archetypes",
                cards=[
                    CardIn(
                        id="card-alkanes",
                        prompt="Define an alkane.",
                        answer="A saturated hydrocarbon composed solely of single bonds.",
                        keypoints=[
                            "saturated hydrocarbon",
                            "single bonds",
                            "general formula CnH2n+2"
                        ]
                    ),
                    CardIn(
                        id="card-alkenes",
                        prompt="Describe the key feature of an alkene.",
                        answer="A hydrocarbon that contains at least one carbon-carbon double bond.",
                        keypoints=[
                            "contains double bond",
                            "unsaturated hydrocarbon"
                        ]
                    ),
                    CardIn(
                        id="card-alkynes",
                        prompt="What differentiates an alkyne?",
                        answer="Unsaturated hydrocarbon featuring at least one carbon-carbon triple bond.",
                        keypoints=[
                            "triple bond",
                            "unsaturated hydrocarbon"
                        ]
                    )
                ]
            )
        )

        await self.create_deck(
            DeckIn(
                id="deck-neuro",
                title="Neuroanatomy Foundations",
                description="Major brain structures and functions",
                cards=[
                    CardIn(
                        id="card-hippocampus",
                        prompt="Role of the hippocampus.",
                        answer="It consolidates short-term memories into long-term storage and supports spatial navigation.",
                        keypoints=[
                            "memory consolidation",
                            "spatial navigation"
                        ]
                    ),
                    CardIn(
                        id="card-amygdala",
                        prompt="What does the amygdala regulate?",
                        answer="Emotional processing, especially fear responses and threat detection.",
                        keypoints=[
                            "emotional processing",
                            "fear response"
                        ]
                    )
                ]
            )
        )

        await conn.commit()


async def bootstrap() -> Path:
    db = Database()
    await db.initialize()
    await db.close()
    return db.path


def sync_bootstrap() -> Path:
    return asyncio.run(bootstrap())


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


