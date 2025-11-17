from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model that serializes fields using camelCase."""

    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)


class Verdict(str, Enum):
    incorrect = "incorrect"
    missing = "missing"
    almost = "almost"
    correct = "correct"


class ScoreRequest(CamelModel):
    card_id: str = Field(..., examples=["card-123"])
    prompt: str
    expected_answer: str
    keypoints: List[str]
    user_answer: str = Field(..., min_length=1)
    alternative_answers: Optional[List[str]] = Field(default_factory=list)


class RateRequest(CamelModel):
    """Request for self-rating a card (Quick Mode)."""
    card_id: str = Field(..., examples=["card-123"])
    quality: int = Field(..., ge=1, le=5, description="SM-2 quality rating (1-5)")


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
    schedule: Optional["ScheduleSnapshot"] = None


class HealthStatus(BaseModel):
    status: str = "ok"
    database: str = "initializing"
    model_cache: str = "cold"
    model_cache_message: Optional[str] = None


class CardIn(CamelModel):
    id: Optional[str] = None
    prompt: str
    answer: str
    keypoints: List[str] = Field(default_factory=list)
    archived: Optional[bool] = None
    alternative_answers: Optional[List[str]] = Field(default_factory=list)


class DeckIn(CamelModel):
    id: Optional[str] = None
    title: str
    description: Optional[str] = None
    cards: List[CardIn] = Field(default_factory=list)


class DeckUpdate(CamelModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cards: Optional[List[CardIn]] = None


class ScheduleSnapshot(CamelModel):
    due_at: str
    interval: int
    ease: float
    streak: int
    quality: Optional[int] = None


class CardRecord(CamelModel):
    id: str
    prompt: str
    answer: Optional[str] = None
    keypoints: List[str] = Field(default_factory=list)
    keypoint_count: int
    schedule: ScheduleSnapshot
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
    reset_schedule = "reset-schedule"
    archive = "archive"
    unarchive = "unarchive"


class BulkCardOperation(CamelModel):
    card_ids: List[str]
    operation: BulkOperationType
