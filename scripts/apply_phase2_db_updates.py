from __future__ import annotations

from pathlib import Path


def main() -> None:
    path = Path("python_sidecar/db.py")
    text = path.read_text(encoding="utf-8")

    import_line = (
        "from .models import CardIn, CardRecord, DeckIn, DeckRecord, DeckUpdate"
    )
    replacement_import = (
        "from .models import AttemptRecord, CardIn, CardRecord, DeckIn, DeckRecord, DeckUpdate, ScoreRequest, ScoreResult, Verdict"
    )
    if import_line in text and replacement_import not in text:
        text = text.replace(import_line, replacement_import)

    schema_snippet = (
        "CREATE TABLE IF NOT EXISTS schedules (\n"
        "    card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,\n"
        "    ease REAL NOT NULL DEFAULT 2.5,\n"
        "    interval INTEGER NOT NULL DEFAULT 1,\n"
        "    due_at TEXT NOT NULL DEFAULT (datetime('now')),\n"
        "    streak INTEGER NOT NULL DEFAULT 0\n"
        ");\n""""
    )
    schema_replacement = (
        "CREATE TABLE IF NOT EXISTS schedules (\n"
        "    card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,\n"
        "    ease REAL NOT NULL DEFAULT 2.5,\n"
        "    interval INTEGER NOT NULL DEFAULT 1,\n"
        "    due_at TEXT NOT NULL DEFAULT (datetime('now')),\n"
        "    streak INTEGER NOT NULL DEFAULT 0\n"
        ");\n\nCREATE INDEX IF NOT EXISTS idx_attempts_card ON attempts(card_id, created_at DESC);\n""""
    )
    if "CREATE INDEX IF NOT EXISTS idx_attempts_card" not in text:
        text = text.replace(schema_snippet, schema_replacement)

    marker = (
        "    async def delete_deck(self, deck_id: str) -> None:\n"
        "        conn = self._require_connection()\n"
        "        await conn.execute(\"DELETE FROM decks WHERE id = ?\", (deck_id,))\n"
        "        await conn.commit()\n\n"
    )
    if marker in text and "async def record_attempt" not in text:
        addition = (
            "    async def record_attempt(self, payload: ScoreRequest, result: ScoreResult) -> None:\n"
            "        conn = self._require_connection()\n"
            "        attempt_id = str(uuid4())\n"
            "        timestamp = _utc_now()\n"
            "        metadata = {\n"
            "            \"prompt\": payload.prompt,\n"
            "            \"expected_answer\": payload.expected_answer,\n"
            "            \"keypoints\": payload.keypoints,\n"
            "            \"missing_keypoints\": result.missing_keypoints,\n"
            "            \"feedback\": result.feedback,\n"
            "            \"cosine\": result.cosine,\n"
            "            \"coverage\": result.coverage\n"
            "        }\n"
            "        await conn.execute(\n"
            "            \"INSERT INTO attempts (id, card_id, user_answer, verdict, score, created_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)\",\n"
            "            (\n"
            "                attempt_id,\n"
            "                payload.card_id,\n"
            "                payload.user_answer,\n"
            "                result.verdict.value,\n"
            "                result.score,\n"
            "                timestamp,\n"
            "                json.dumps(metadata)\n"
            "            )\n"
            "        )\n"
            "        await conn.commit()\n\n"
            "    async def list_attempts(self, card_id: str, limit: int = 25) -> List[AttemptRecord]:\n"
            "        conn = self._require_connection()\n"
            "        limit = max(1, min(limit, 200))\n"
            "        cursor = await conn.execute(\n"
            "            \"SELECT id, user_answer, verdict, score, created_at, payload FROM attempts WHERE card_id = ? ORDER BY datetime(created_at) DESC LIMIT ?\",\n"
            "            (card_id, limit)\n"
            "        )\n"
            "        rows = await cursor.fetchall()\n"
            "        attempts: List[AttemptRecord] = []\n"
            "        for row in rows:\n"
            "            metadata = json.loads(row[\"payload\"]) if row[\"payload\"] else {}\n"
            "            attempts.append(\n"
            "                AttemptRecord(\n"
            "                    id=row[\"id\"],\n"
            "                    card_id=card_id,\n"
            "                    user_answer=row[\"user_answer\"],\n"
            "                    verdict=Verdict(row[\"verdict\"]),\n"
            "                    score=float(row[\"score\"]),\n"
            "                    cosine=float(metadata.get(\"cosine\", row[\"score\"])),\n"
            "                    coverage=float(metadata.get(\"coverage\", metadata.get(\"score\", row[\"score\"]))),\n"
            "                    missing_keypoints=list(metadata.get(\"missing_keypoints\", [])),\n"
            "                    feedback=metadata.get(\"feedback\"),\n"
            "                    prompt=metadata.get(\"prompt\"),\n"
            "                    expected_answer=metadata.get(\"expected_answer\"),\n"
            "                    keypoints=list(metadata.get(\"keypoints\", [])),\n"
            "                    created_at=row[\"created_at\"]\n"
            "                )\n"
            "            )\n"
            "        return attempts\n\n"
        )
        text = text.replace(marker, marker + addition)

    path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
