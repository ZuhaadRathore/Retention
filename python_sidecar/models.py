from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator
from pydantic.alias_generators import to_camel

# Security limits for input validation
MAX_BULK_CARDS = 500  # Conservative limit below SQLite's default 999 parameter limit
MAX_CARDS_PER_DECK = 1000  # Maximum cards allowed per deck
MAX_ID_LENGTH = 100   # Maximum length for UUID/ID strings
MAX_TEXT_LENGTH = 10000  # Maximum length for text fields (prompts, answers, descriptions)


class CamelModel(BaseModel):
    """Base model that serializes fields using camelCase."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class Verdict(str, Enum):
    incorrect = "incorrect"
    missing = "missing"
    almost = "almost"
    correct = "correct"


class ScoreRequest(CamelModel):
    card_id: str = Field(..., examples=["card-123"], max_length=MAX_ID_LENGTH)
    prompt: str = Field(..., max_length=MAX_TEXT_LENGTH)
    expected_answer: str = Field(..., max_length=MAX_TEXT_LENGTH)
    keypoints: List[str]
    user_answer: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)
    alternative_answers: Optional[List[str]] = Field(default_factory=list)


class ScoreResult(BaseModel):
    verdict: Verdict
    score: float = Field(..., ge=0.0, le=1.0)
    missing_keypoints: List[str] = Field(default_factory=list)
    feedback: Optional[str] = None
    cosine: float = Field(..., ge=0.0, le=1.0)
    coverage: float = Field(..., ge=0.0, le=1.0)


class AttemptRecord(CamelModel):
    id: str
    card_id: str
    user_answer: str
    verdict: Verdict
    score: float = Field(..., ge=0.0, le=1.0)
    cosine: float = Field(..., ge=0.0, le=1.0)
    coverage: float = Field(..., ge=0.0, le=1.0)
    missing_keypoints: List[str] = Field(default_factory=list)
    feedback: Optional[str] = None
    prompt: Optional[str] = None
    expected_answer: Optional[str] = None
    keypoints: List[str] = Field(default_factory=list)
    created_at: str


class HealthStatus(BaseModel):
    status: str = "ok"
    database: str = "initializing"
    model_cache: str = "cold"
    model_cache_message: Optional[str] = None


class CardIn(CamelModel):
    id: Optional[str] = Field(None, max_length=MAX_ID_LENGTH)
    prompt: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)
    answer: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)
    keypoints: List[str] = Field(default_factory=list)
    archived: Optional[bool] = None
    alternative_answers: Optional[List[str]] = Field(default_factory=list)


class DeckIn(CamelModel):
    id: Optional[str] = Field(None, max_length=MAX_ID_LENGTH)
    title: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_TEXT_LENGTH)
    cards: List[CardIn] = Field(default_factory=list, max_length=MAX_CARDS_PER_DECK)


class DeckUpdate(CamelModel):
    title: Optional[str] = Field(None, min_length=1, max_length=MAX_TEXT_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_TEXT_LENGTH)
    cards: Optional[List[CardIn]] = Field(None, max_length=MAX_CARDS_PER_DECK)


class CardRecord(CamelModel):
    id: str
    prompt: str
    answer: Optional[str] = None
    keypoints: List[str] = Field(default_factory=list)
    keypoint_count: int
    archived: Optional[bool] = None
    alternative_answers: Optional[List[str]] = Field(default_factory=list)


class DeckRecord(CamelModel):
    id: str
    title: str
    description: Optional[str] = None
    card_count: int
    updated_at: str
    cards: List[CardRecord] = Field(default_factory=list)


class BulkOperationType(str, Enum):
    mark_learned = "mark-learned"
    archive = "archive"
    unarchive = "unarchive"


class BulkCardOperation(CamelModel):
    card_ids: List[str] = Field(..., min_length=1, max_length=MAX_BULK_CARDS)
    operation: BulkOperationType

    @field_validator('card_ids')
    @classmethod
    def validate_card_ids(cls, v: List[str]) -> List[str]:
        """Validate card IDs for security and integrity."""
        if not v:
            raise ValueError("card_ids cannot be empty")

        if len(v) > MAX_BULK_CARDS:
            raise ValueError(f"Too many cards: {len(v)} exceeds maximum of {MAX_BULK_CARDS}")

        for card_id in v:
            if not isinstance(card_id, str):
                raise ValueError(f"Invalid card_id type: expected str, got {type(card_id).__name__}")

            if len(card_id) > MAX_ID_LENGTH:
                raise ValueError(f"card_id too long: {len(card_id)} exceeds maximum of {MAX_ID_LENGTH}")

            if not card_id.strip():
                raise ValueError("card_id cannot be empty or whitespace")

        return v
