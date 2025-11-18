"""
Security validation tests for input validation and SQL injection prevention.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from python_sidecar.db import _validate_card_ids, MAX_BULK_CARDS, MAX_ID_LENGTH
from python_sidecar.models import (
    BulkCardOperation,
    BulkOperationType,
    CardIn,
    DeckIn,
    DeckUpdate,
    ScoreRequest,
    MAX_CARDS_PER_DECK,
    MAX_TEXT_LENGTH,
)


class TestCardIdValidation:
    """Test _validate_card_ids function for security."""

    def test_empty_array_raises_error(self) -> None:
        """Empty card_ids array should raise ValueError."""
        with pytest.raises(ValueError, match="card_ids cannot be empty"):
            _validate_card_ids([])

    def test_too_many_cards_raises_error(self) -> None:
        """Exceeding MAX_BULK_CARDS should raise ValueError."""
        too_many = ["card-" + str(i) for i in range(MAX_BULK_CARDS + 1)]
        with pytest.raises(ValueError, match=f"Too many cards.*{MAX_BULK_CARDS}"):
            _validate_card_ids(too_many)

    def test_invalid_type_raises_error(self) -> None:
        """Non-string card IDs should raise ValueError."""
        with pytest.raises(ValueError, match="Invalid card_id type"):
            _validate_card_ids([123])  # type: ignore

    def test_too_long_id_raises_error(self) -> None:
        """Card IDs exceeding MAX_ID_LENGTH should raise ValueError."""
        long_id = "x" * (MAX_ID_LENGTH + 1)
        with pytest.raises(ValueError, match=f"card_id too long.*{MAX_ID_LENGTH}"):
            _validate_card_ids([long_id])

    def test_empty_string_raises_error(self) -> None:
        """Empty or whitespace card IDs should raise ValueError."""
        with pytest.raises(ValueError, match="cannot be empty or whitespace"):
            _validate_card_ids([""])
        with pytest.raises(ValueError, match="cannot be empty or whitespace"):
            _validate_card_ids(["   "])

    def test_valid_ids_pass(self) -> None:
        """Valid card IDs should pass validation."""
        valid_ids = ["card-1", "card-2", "card-3"]
        _validate_card_ids(valid_ids)  # Should not raise


class TestBulkCardOperationValidation:
    """Test BulkCardOperation Pydantic model validation."""

    def test_empty_card_ids_raises_error(self) -> None:
        """Empty card_ids should fail validation."""
        with pytest.raises(ValidationError):
            BulkCardOperation(card_ids=[], operation=BulkOperationType.archive)

    def test_too_many_cards_raises_error(self) -> None:
        """Exceeding MAX_BULK_CARDS should fail validation."""
        too_many = ["card-" + str(i) for i in range(MAX_BULK_CARDS + 1)]
        with pytest.raises(ValidationError, match="Too many cards"):
            BulkCardOperation(card_ids=too_many, operation=BulkOperationType.archive)

    def test_long_id_raises_error(self) -> None:
        """Card IDs exceeding MAX_ID_LENGTH should fail validation."""
        long_id = "x" * (MAX_ID_LENGTH + 1)
        with pytest.raises(ValidationError, match="card_id too long"):
            BulkCardOperation(card_ids=[long_id], operation=BulkOperationType.archive)

    def test_whitespace_id_raises_error(self) -> None:
        """Whitespace-only card IDs should fail validation."""
        with pytest.raises(ValidationError, match="cannot be empty or whitespace"):
            BulkCardOperation(card_ids=["  "], operation=BulkOperationType.archive)

    def test_valid_operation_passes(self) -> None:
        """Valid bulk operation should pass validation."""
        op = BulkCardOperation(
            card_ids=["card-1", "card-2"], operation=BulkOperationType.archive
        )
        assert len(op.card_ids) == 2


class TestDeckValidation:
    """Test DeckIn and DeckUpdate model validation."""

    def test_deck_with_too_many_cards_raises_error(self) -> None:
        """Decks exceeding MAX_CARDS_PER_DECK should fail validation."""
        too_many_cards = [
            CardIn(prompt=f"Q{i}", answer=f"A{i}")
            for i in range(MAX_CARDS_PER_DECK + 1)
        ]
        with pytest.raises(ValidationError):
            DeckIn(title="Test", cards=too_many_cards)

    def test_deck_update_with_too_many_cards_raises_error(self) -> None:
        """Deck updates exceeding MAX_CARDS_PER_DECK should fail validation."""
        too_many_cards = [
            CardIn(prompt=f"Q{i}", answer=f"A{i}")
            for i in range(MAX_CARDS_PER_DECK + 1)
        ]
        with pytest.raises(ValidationError):
            DeckUpdate(cards=too_many_cards)

    def test_empty_title_raises_error(self) -> None:
        """Empty deck title should fail validation."""
        with pytest.raises(ValidationError):
            DeckIn(title="", cards=[])

    def test_long_title_raises_error(self) -> None:
        """Titles exceeding MAX_TEXT_LENGTH should fail validation."""
        long_title = "x" * (MAX_TEXT_LENGTH + 1)
        with pytest.raises(ValidationError):
            DeckIn(title=long_title, cards=[])

    def test_long_description_raises_error(self) -> None:
        """Descriptions exceeding MAX_TEXT_LENGTH should fail validation."""
        long_desc = "x" * (MAX_TEXT_LENGTH + 1)
        with pytest.raises(ValidationError):
            DeckIn(title="Test", description=long_desc, cards=[])

    def test_long_deck_id_raises_error(self) -> None:
        """Deck IDs exceeding MAX_ID_LENGTH should fail validation."""
        long_id = "x" * (MAX_ID_LENGTH + 1)
        with pytest.raises(ValidationError):
            DeckIn(id=long_id, title="Test", cards=[])

    def test_valid_deck_passes(self) -> None:
        """Valid deck should pass validation."""
        deck = DeckIn(
            title="Test Deck",
            description="Test Description",
            cards=[CardIn(prompt="Q1", answer="A1")],
        )
        assert deck.title == "Test Deck"


class TestCardValidation:
    """Test CardIn model validation."""

    def test_empty_prompt_raises_error(self) -> None:
        """Empty prompt should fail validation."""
        with pytest.raises(ValidationError):
            CardIn(prompt="", answer="Answer")

    def test_empty_answer_raises_error(self) -> None:
        """Empty answer should fail validation."""
        with pytest.raises(ValidationError):
            CardIn(prompt="Question", answer="")

    def test_long_prompt_raises_error(self) -> None:
        """Prompts exceeding MAX_TEXT_LENGTH should fail validation."""
        long_prompt = "x" * (MAX_TEXT_LENGTH + 1)
        with pytest.raises(ValidationError):
            CardIn(prompt=long_prompt, answer="Answer")

    def test_long_answer_raises_error(self) -> None:
        """Answers exceeding MAX_TEXT_LENGTH should fail validation."""
        long_answer = "x" * (MAX_TEXT_LENGTH + 1)
        with pytest.raises(ValidationError):
            CardIn(prompt="Question", answer=long_answer)

    def test_long_card_id_raises_error(self) -> None:
        """Card IDs exceeding MAX_ID_LENGTH should fail validation."""
        long_id = "x" * (MAX_ID_LENGTH + 1)
        with pytest.raises(ValidationError):
            CardIn(id=long_id, prompt="Question", answer="Answer")

    def test_valid_card_passes(self) -> None:
        """Valid card should pass validation."""
        card = CardIn(
            prompt="What is Python?",
            answer="A programming language",
            keypoints=["interpreted", "high-level"],
        )
        assert card.prompt == "What is Python?"


class TestScoreRequestValidation:
    """Test ScoreRequest model validation."""

    def test_long_card_id_raises_error(self) -> None:
        """Card IDs exceeding MAX_ID_LENGTH should fail validation."""
        long_id = "x" * (MAX_ID_LENGTH + 1)
        with pytest.raises(ValidationError):
            ScoreRequest(
                card_id=long_id,
                prompt="Q",
                expected_answer="A",
                keypoints=[],
                user_answer="UA",
            )

    def test_long_prompt_raises_error(self) -> None:
        """Prompts exceeding MAX_TEXT_LENGTH should fail validation."""
        long_text = "x" * (MAX_TEXT_LENGTH + 1)
        with pytest.raises(ValidationError):
            ScoreRequest(
                card_id="card-1",
                prompt=long_text,
                expected_answer="A",
                keypoints=[],
                user_answer="UA",
            )

    def test_long_expected_answer_raises_error(self) -> None:
        """Expected answers exceeding MAX_TEXT_LENGTH should fail validation."""
        long_text = "x" * (MAX_TEXT_LENGTH + 1)
        with pytest.raises(ValidationError):
            ScoreRequest(
                card_id="card-1",
                prompt="Q",
                expected_answer=long_text,
                keypoints=[],
                user_answer="UA",
            )

    def test_long_user_answer_raises_error(self) -> None:
        """User answers exceeding MAX_TEXT_LENGTH should fail validation."""
        long_text = "x" * (MAX_TEXT_LENGTH + 1)
        with pytest.raises(ValidationError):
            ScoreRequest(
                card_id="card-1",
                prompt="Q",
                expected_answer="A",
                keypoints=[],
                user_answer=long_text,
            )

    def test_empty_user_answer_raises_error(self) -> None:
        """Empty user answer should fail validation."""
        with pytest.raises(ValidationError):
            ScoreRequest(
                card_id="card-1",
                prompt="Q",
                expected_answer="A",
                keypoints=[],
                user_answer="",
            )

    def test_valid_score_request_passes(self) -> None:
        """Valid score request should pass validation."""
        req = ScoreRequest(
            card_id="card-1",
            prompt="What is 2+2?",
            expected_answer="4",
            keypoints=["addition"],
            user_answer="Four",
        )
        assert req.card_id == "card-1"
