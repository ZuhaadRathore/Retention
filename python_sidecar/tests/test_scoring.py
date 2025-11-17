from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import pytest

from python_sidecar.models import ScoreRequest, Verdict
from python_sidecar.scoring import (
    EmbeddingScorer,
    MIN_BORDERLINE_SCORE,
    SCORE_THRESHOLDS,
    ScoreComponents,
    _classify,
    _downgrade,
)


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (SCORE_THRESHOLDS[0][1], Verdict.correct),
        (0.95, Verdict.correct),
        (SCORE_THRESHOLDS[0][1] - 1e-4, Verdict.almost),
        (SCORE_THRESHOLDS[1][1], Verdict.almost),
        (SCORE_THRESHOLDS[1][1] - 1e-4, Verdict.missing),
        (SCORE_THRESHOLDS[2][1], Verdict.missing),
        (SCORE_THRESHOLDS[2][1] - 0.01, Verdict.missing),
        (MIN_BORDERLINE_SCORE, Verdict.missing),
        (MIN_BORDERLINE_SCORE - 1e-4, Verdict.incorrect),
    ],
)
def test_classify_thresholds(score: float, expected: Verdict) -> None:
    """Rubric thresholds should map to their expected verdicts."""
    assert _classify(score) == expected


@pytest.mark.parametrize(
    ("verdict", "expected"),
    [
        (Verdict.correct, Verdict.almost),
        (Verdict.almost, Verdict.missing),
        (Verdict.missing, Verdict.incorrect),
        (Verdict.incorrect, Verdict.incorrect),
    ],
)
def test_downgrade_sequence(verdict: Verdict, expected: Verdict) -> None:
    """Downgrading should move through the verdict progression without wrapping."""
    assert _downgrade(verdict) == expected


REGRESSION_FIXTURES: List[Dict[str, Any]] = [
    {
        "card_id": "fixture-correct",
        "keypoints": [],
        "components": {
            "score": 0.903,
            "cosine": 0.902,
            "coverage": 0.99,
            "missing_keypoints": (),
        },
        "expected_verdict": Verdict.correct,
        "expected_feedback": None,
        "description": "High score without keypoints remains correct.",
    },
    {
        "card_id": "fixture-low-coverage",
        "keypoints": ["metabolism", "enzymes"],
        "components": {
            "score": 0.889,
            "cosine": 0.931,
            "coverage": 0.35,
            "missing_keypoints": (),
        },
        "expected_verdict": Verdict.almost,
        "expected_feedback": None,
        "description": "Low coverage with keypoints downgrades a correct verdict to almost.",
    },
    {
        "card_id": "fixture-low-coverage-no-kp",
        "keypoints": [],
        "components": {
            "score": 0.884,
            "cosine": 0.913,
            "coverage": 0.32,
            "missing_keypoints": (),
        },
        "expected_verdict": Verdict.correct,
        "expected_feedback": None,
        "description": "Low coverage with no keypoints should not downgrade.",
    },
    {
        "card_id": "fixture-missing-keypoints",
        "keypoints": ["ATP production", "Cellular respiration"],
        "components": {
            "score": 0.901,
            "cosine": 0.94,
            "coverage": 0.83,
            "missing_keypoints": ("ATP production",),
        },
        "expected_verdict": Verdict.almost,
        "expected_feedback": "Missing keypoints: ATP production",
        "description": "Missing keypoints should downgrade a correct verdict to almost.",
    },
    {
        "card_id": "fixture-borderline",
        "keypoints": ["DNA replication"],
        "components": {
            "score": 0.673,
            "cosine": 0.66,
            "coverage": 0.71,
            "missing_keypoints": (),
        },
        "expected_verdict": Verdict.missing,
        "expected_feedback": "Review the reference answer for more context.",
        "description": "Scores between the missing threshold and borderline floor stay missing.",
    },
    {
        "card_id": "fixture-incorrect",
        "keypoints": ["kinetic energy", "momentum"],
        "components": {
            "score": 0.412,
            "cosine": 0.41,
            "coverage": 0.33,
            "missing_keypoints": ("kinetic energy", "momentum"),
        },
        "expected_verdict": Verdict.incorrect,
        "expected_feedback": (
            "Missing keypoints: kinetic energy, momentum "
            "Review the reference answer for more context."
        ),
        "description": "Very low scores remain incorrect and include full feedback.",
    },
]


def test_embedding_scorer_regression_cases(monkeypatch: pytest.MonkeyPatch) -> None:
    """Regression fixtures cover rubric edge cases without loading the embedding model."""

    fixture_map = {case["card_id"]: case for case in REGRESSION_FIXTURES}

    async def stub_ensure_model(self: EmbeddingScorer) -> str:
        return "stub-model"

    async def run_in_place(func, *args, **kwargs):
        return func(*args, **kwargs)

    def fake_score_sync(self: EmbeddingScorer, model: object, payload: ScoreRequest) -> ScoreComponents:
        case = fixture_map.get(payload.card_id)
        if not case:
            raise AssertionError(f"Unexpected payload {payload.card_id!r}")
        comp = case["components"]
        return ScoreComponents(
            score=comp["score"],
            cosine=comp["cosine"],
            coverage=comp["coverage"],
            missing_keypoints=list(comp["missing_keypoints"]),
        )

    monkeypatch.setattr(EmbeddingScorer, "_ensure_model", stub_ensure_model)
    monkeypatch.setattr(asyncio, "to_thread", run_in_place)
    monkeypatch.setattr(EmbeddingScorer, "_score_sync", fake_score_sync)

    scorer = EmbeddingScorer()

    for case in REGRESSION_FIXTURES:
        payload = ScoreRequest(
            card_id=case["card_id"],
            prompt="Prompt text",
            expected_answer="Reference answer",
            keypoints=case["keypoints"],
            user_answer="User answer",
        )

        result = asyncio.run(scorer.score(payload))

        expected_score = round(case["components"]["score"], 2)
        expected_cosine = round(case["components"]["cosine"], 2)
        expected_coverage = round(case["components"]["coverage"], 2)
        expected_missing = list(case["components"]["missing_keypoints"])

        assert result.verdict == case["expected_verdict"], case["description"]
        assert result.score == expected_score, case["description"]
        assert result.cosine == expected_cosine, case["description"]
        assert result.coverage == expected_coverage, case["description"]
        assert result.missing_keypoints == expected_missing, case["description"]
        assert result.feedback == case["expected_feedback"], case["description"]

