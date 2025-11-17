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
    ScheduleSnapshot,
    ScoreRequest,
    ScoreResult,
    Verdict
)


def _default_data_dir() -> Path:
    override = os.getenv("FLASH_AI_DATA_DIR")
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

    return root / "Flash-AI"


DATA_DIR = _default_data_dir()
DB_PATH = DATA_DIR / "flash_ai.sqlite"

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

CREATE TABLE IF NOT EXISTS schedules (
    card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    ease REAL NOT NULL DEFAULT 2.5,
    interval INTEGER NOT NULL DEFAULT 1,
    due_at TEXT NOT NULL DEFAULT (datetime('now')),
    streak INTEGER NOT NULL DEFAULT 0
);
"""

DEFAULT_EASE = 2.5
MIN_EASE = 1.3
INITIAL_INTERVAL = 1
SECOND_INTERVAL = 6

VERDICT_TO_QUALITY = {
    Verdict.correct: 5,
    Verdict.almost: 4,
    Verdict.missing: 2,
    Verdict.incorrect: 1
}

MIN_SUCCESS_QUALITY = 3


class Database:
    """Lazy SQLite connector used by the sidecar."""

    def __init__(self) -> None:
        self._connection: Optional[aiosqlite.Connection] = None
        self._state: str = "cold"

    async def initialize(self) -> None:
        self._state = "initializing"
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            self._connection = await aiosqlite.connect(DB_PATH)
            self._connection.row_factory = aiosqlite.Row
            await self._connection.executescript(SCHEMA)
            await self._migrate_archived_column()
            await self._migrate_alternative_answers_column()
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
        schedule = await self._update_schedule(conn, request.card_id, result.verdict, timestamp)
        schedule_snapshot = ScheduleSnapshot(**schedule)
        payload = {
            "prompt": request.prompt,
            "expected_answer": request.expected_answer,
            "keypoints": request.keypoints,
            "missing_keypoints": result.missing_keypoints,
            "feedback": result.feedback,
            "cosine": result.cosine,
            "coverage": result.coverage,
            "verdict": result.verdict.value,
            "schedule": schedule
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
            created_at=timestamp,
            schedule=schedule_snapshot
        )

    async def record_self_rating(self, card_id: str, quality: int) -> ScheduleSnapshot:
        """Record a self-rating and update schedule. Returns updated schedule."""
        conn = self._require_connection()
        timestamp = _utc_now()

        # Map quality to a verdict for consistency
        if quality >= 5:
            verdict = Verdict.correct
        elif quality >= 4:
            verdict = Verdict.almost
        elif quality >= 3:
            verdict = Verdict.missing
        else:
            verdict = Verdict.incorrect

        schedule = await self._update_schedule(conn, card_id, verdict, timestamp)
        await conn.commit()

        return ScheduleSnapshot(**schedule)

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
            schedule_data = payload.get("schedule")
            schedule = ScheduleSnapshot(**schedule_data) if schedule_data else None
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
                    created_at=row["created_at"],
                    schedule=schedule
                )
            )
        return attempts

    async def _update_schedule(
        self,
        conn: aiosqlite.Connection,
        card_id: str,
        verdict: Verdict,
        timestamp: str
    ) -> dict:
        """Apply SM-2 style scheduling updates for a card and return the new schedule snapshot."""

        cursor = await conn.execute(
            "SELECT ease, interval, streak FROM schedules WHERE card_id = ?",
            (card_id,)
        )
        row = await cursor.fetchone()
        ease = float(row["ease"]) if row else DEFAULT_EASE
        interval = int(row["interval"]) if row else INITIAL_INTERVAL
        streak = int(row["streak"]) if row else 0

        quality = VERDICT_TO_QUALITY.get(verdict, 2)
        ease = max(
            MIN_EASE,
            ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        )

        if quality < MIN_SUCCESS_QUALITY:
            streak = 0
            interval = INITIAL_INTERVAL
        else:
            streak += 1
            if streak == 1:
                interval = INITIAL_INTERVAL
            elif streak == 2:
                interval = SECOND_INTERVAL
            else:
                interval = max(1, round(interval * ease))

        base = datetime.fromisoformat(timestamp)
        due_at = (base + timedelta(days=interval)).isoformat()

        await conn.execute(
            """
            INSERT INTO schedules (card_id, ease, interval, due_at, streak)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(card_id) DO UPDATE SET
                ease = excluded.ease,
                interval = excluded.interval,
                due_at = excluded.due_at,
                streak = excluded.streak
            """,
            (card_id, ease, interval, due_at, streak)
        )

        return {
            "ease": ease,
            "interval": interval,
            "due_at": due_at,
            "streak": streak,
            "quality": quality
        }

    async def _fetch_cards(self, deck_id: str) -> List[CardRecord]:
        conn = self._require_connection()
        cursor = await conn.execute(
            """
            SELECT c.id, c.prompt, c.answer, c.keypoints, c.archived, c.alternative_answers,
                   s.due_at, s.interval, s.ease, s.streak
            FROM cards AS c
            LEFT JOIN schedules AS s ON s.card_id = c.id
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
            schedule = ScheduleSnapshot(
                due_at=row["due_at"] or _utc_now(),
                interval=int(row["interval"] or INITIAL_INTERVAL),
                ease=float(row["ease"] or DEFAULT_EASE),
                streak=int(row["streak"] or 0)
            )
            archived = bool(row["archived"]) if row["archived"] is not None else False
            cards.append(
                CardRecord(
                    id=row["id"],
                    prompt=row["prompt"],
                    answer=row["answer"],
                    keypoints=keypoints,
                    keypoint_count=len(keypoints),
                    schedule=schedule,
                    archived=archived if archived else None,
                    alternative_answers=alternative_answers if alternative_answers else None
                )
            )
        return cards

    async def _replace_cards(self, deck_id: str, cards: List[CardIn], timestamp: str) -> None:
        conn = self._require_connection()
        cursor = await conn.execute(
            """
            SELECT c.id, s.ease, s.interval, s.due_at, s.streak
            FROM cards AS c
            LEFT JOIN schedules AS s ON s.card_id = c.id
            WHERE c.deck_id = ?
            """,
            (deck_id,)
        )
        existing_rows = await cursor.fetchall()
        schedule_snapshot = {
            row["id"]: {
                "ease": float(row["ease"]) if row["ease"] is not None else DEFAULT_EASE,
                "interval": int(row["interval"]) if row["interval"] is not None else INITIAL_INTERVAL,
                "due_at": row["due_at"] or timestamp,
                "streak": int(row["streak"]) if row["streak"] is not None else 0
            }
            for row in existing_rows
        }

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
            schedule = schedule_snapshot.get(card_id)
            if schedule is None:
                schedule = {
                    "ease": DEFAULT_EASE,
                    "interval": INITIAL_INTERVAL,
                    "due_at": timestamp,
                    "streak": 0
                }
            await conn.execute(
                """
                INSERT INTO schedules (card_id, ease, interval, due_at, streak)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(card_id) DO UPDATE SET
                    ease = excluded.ease,
                    interval = excluded.interval,
                    due_at = excluded.due_at,
                    streak = excluded.streak
                """,
                (card_id, schedule["ease"], schedule["interval"], schedule["due_at"], schedule["streak"])
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

        conn = self._require_connection()
        timestamp = _utc_now()

        # Verify all cards belong to this deck
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
            placeholders = ",".join("?" * len(valid_cards))
            await conn.execute(
                f"UPDATE cards SET archived = 1, updated_at = ? WHERE id IN ({placeholders})",
                (timestamp, *valid_cards)
            )
        elif operation == BulkOperationType.unarchive:
            # Unarchive cards
            placeholders = ",".join("?" * len(valid_cards))
            await conn.execute(
                f"UPDATE cards SET archived = 0, updated_at = ? WHERE id IN ({placeholders})",
                (timestamp, *valid_cards)
            )
        elif operation == BulkOperationType.mark_learned:
            # Mark as learned - set very long interval (180 days)
            for card_id in valid_cards:
                due_at = (datetime.fromisoformat(timestamp) + timedelta(days=180)).isoformat()
                await conn.execute(
                    """
                    INSERT INTO schedules (card_id, ease, interval, due_at, streak)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(card_id) DO UPDATE SET
                        ease = 2.5,
                        interval = 180,
                        due_at = excluded.due_at,
                        streak = 10
                    """,
                    (card_id, 2.5, 180, due_at, 10)
                )
        elif operation == BulkOperationType.reset_schedule:
            # Reset schedule to initial state
            for card_id in valid_cards:
                await conn.execute(
                    """
                    INSERT INTO schedules (card_id, ease, interval, due_at, streak)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(card_id) DO UPDATE SET
                        ease = 2.5,
                        interval = 1,
                        due_at = ?,
                        streak = 0
                    """,
                    (card_id, DEFAULT_EASE, INITIAL_INTERVAL, timestamp, 0, timestamp)
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


