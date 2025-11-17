from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import numpy as np

from .db import DATA_DIR
from .models import ScoreRequest, ScoreResult, Verdict

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_CACHE_DIR = DATA_DIR / "models"


def _get_bundled_model_path() -> Optional[Path]:
    """Get the path to the bundled model if running as PyInstaller executable."""
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        # Running as PyInstaller bundle
        bundled_path = Path(sys._MEIPASS) / "models" / "sentence-transformers" / "all-MiniLM-L6-v2"
        if bundled_path.exists():
            return bundled_path

    # Check if running from source with pre-downloaded model
    source_model_path = Path(__file__).resolve().parent.parent / "models" / "sentence-transformers" / "all-MiniLM-L6-v2"
    if source_model_path.exists():
        return source_model_path

    return None
EMBEDDING_WEIGHT = 0.65
KEYPOINT_WEIGHT = 0.35
KEYPOINT_SIM_THRESHOLD = 0.58

SCORE_THRESHOLDS = [
    (Verdict.correct, 0.86),
    (Verdict.almost, 0.76),
    (Verdict.missing, 0.72)
]
MIN_BORDERLINE_SCORE = 0.60

VERDICT_SEQUENCE = [
    Verdict.correct,
    Verdict.almost,
    Verdict.missing,
    Verdict.incorrect
]


@dataclass
class ScoreComponents:
    score: float
    cosine: float
    coverage: float
    missing_keypoints: List[str]


@dataclass
class ModelCacheStatus:
    state: str
    message: Optional[str] = None


class EmbeddingScorer:
    """Lazy loader for the sentence-transformer scoring model."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._model = None
        self._state = "cold"
        self._state_detail: Optional[str] = "Model cache has not been initialized yet."
        self._last_progress_percent: Optional[int] = None
        MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    async def score(self, payload: ScoreRequest) -> ScoreResult:
        # Fast path: check for exact match with expected answer or alternative answers
        user_answer_normalized = payload.user_answer.strip().lower()
        expected_normalized = payload.expected_answer.strip().lower()

        # Check if user answer matches expected answer
        if user_answer_normalized == expected_normalized:
            return ScoreResult(
                verdict=Verdict.correct,
                score=1.0,
                missing_keypoints=[],
                feedback="Excellent! Your answer covers all key concepts.",
                cosine=1.0,
                coverage=1.0
            )

        # Check if user answer matches any alternative answer
        if payload.alternative_answers:
            for alt in payload.alternative_answers:
                if user_answer_normalized == alt.strip().lower():
                    return ScoreResult(
                        verdict=Verdict.correct,
                        score=1.0,
                        missing_keypoints=[],
                        feedback="Excellent! Your answer covers all key concepts.",
                        cosine=1.0,
                        coverage=1.0
                    )

        # No exact match, proceed with AI scoring
        model = await self._ensure_model()
        components = await asyncio.to_thread(self._score_sync, model, payload)
        verdict = _classify(components.score)

        if payload.keypoints and components.coverage < 0.4:
            verdict = _downgrade(verdict)
        if payload.keypoints and components.missing_keypoints and verdict == Verdict.correct:
            verdict = Verdict.almost

        # Generate contextual feedback based on verdict and missing keypoints
        feedback = _generate_feedback(verdict, components, payload.keypoints)

        return ScoreResult(
            verdict=verdict,
            score=round(components.score, 2),
            missing_keypoints=components.missing_keypoints,
            feedback=feedback,
            cosine=round(components.cosine, 2),
            coverage=round(components.coverage, 2)
        )

    async def warm(self) -> None:
        await self._ensure_model()

    async def _ensure_model(self):
        if self._model is not None:
            return self._model

        async with self._lock:
            if self._model is not None:
                return self._model
            self._model = await asyncio.to_thread(self._load_model)
            return self._model

    def _set_state(self, state: str, detail: Optional[str]) -> None:
        self._state = state
        self._state_detail = detail

    def _emit_model_event(self, state: str, detail: str, progress: Optional[int] = None) -> None:
        self._set_state(state, detail)
        payload = {"state": state, "message": detail}
        if progress is not None:
            payload["progress"] = int(progress)
        print(f"[model] {detail}", flush=True)
        print(f"[model-event]{json.dumps(payload, separators=(',', ':'))}", flush=True)

    def _download_model(self) -> None:
        from huggingface_hub import snapshot_download

        self._last_progress_percent = None

        def on_progress(progress) -> None:
            total = getattr(progress, "total", None)
            current = getattr(progress, "current", None)
            if not total or current is None or total <= 0:
                return
            percent = int((current / total) * 100)
            previous = self._last_progress_percent if self._last_progress_percent is not None else -5
            if percent == self._last_progress_percent:
                return
            if percent - previous < 5 and percent not in (0, 100):
                return
            message = f"Downloading embedding model ({percent}%)..."
            self._emit_model_event("downloading", message, percent)
            self._last_progress_percent = percent

        snapshot_download(
            repo_id=MODEL_NAME,
            local_dir=str(MODEL_CACHE_DIR),
            local_dir_use_symlinks=False,
            resume_download=True
        )

    def _load_model(self):
        from sentence_transformers import SentenceTransformer

        preparation_msg = f"Preparing embedding model {MODEL_NAME}"
        self._emit_model_event("initializing", preparation_msg, 5)

        # Check for bundled model first
        bundled_model_path = _get_bundled_model_path()

        try:
            if bundled_model_path:
                # Load from bundled model (no download needed)
                loading_msg = "Loading bundled embedding model..."
                self._emit_model_event("loading", loading_msg, 50)
                self._emit_model_event("initializing", "Initializing bundled model...", 75)
                model = SentenceTransformer(str(bundled_model_path))
                self._emit_model_event("ready", "Bundled embedding model ready", 100)
                return model

            # Fallback to download if no bundled model (backward compatibility)
            cache_contents = list(MODEL_CACHE_DIR.glob("**/*"))
            if not cache_contents:
                download_msg = "Downloading embedding model (first run may take a minute)..."
                self._emit_model_event("downloading", download_msg, 10)
                self._download_model()
                self._emit_model_event("initializing", "Download complete, initializing model...", 95)
            else:
                loading_msg = "Loading cached embedding model..."
                self._emit_model_event("loading", loading_msg, 60)
                self._emit_model_event("initializing", "Validating cached embedding model...", 75)

            model = SentenceTransformer(MODEL_NAME, cache_folder=str(MODEL_CACHE_DIR))

        except Exception as exc:
            error_message = f"Failed to prepare embeddings: {exc}"
            self._emit_model_event("error", error_message)
            raise

        ready_message = "Embedding model ready"
        self._emit_model_event("ready", ready_message, 100)
        return model

    def _score_sync(self, model, payload: ScoreRequest) -> ScoreComponents:
        inputs: List[str] = [payload.user_answer, payload.expected_answer]
        inputs.extend(payload.keypoints)

        embeddings = model.encode(
            inputs,
            convert_to_numpy=True,
            normalize_embeddings=True,
            batch_size=max(4, len(inputs))
        )

        answer_vec = embeddings[0]
        reference_vec = embeddings[1]
        keypoint_vecs = embeddings[2:]

        cosine_raw = float(np.clip(np.dot(answer_vec, reference_vec), -1.0, 1.0))
        cosine = (cosine_raw + 1.0) / 2.0

        missing: List[str] = []
        if not payload.keypoints:
            coverage = 1.0
        else:
            scores: List[float] = []
            for keypoint, vector in zip(payload.keypoints, keypoint_vecs):
                similarity = float(np.clip(np.dot(answer_vec, vector), -1.0, 1.0))
                normalized = (similarity + 1.0) / 2.0
                scores.append(normalized)
                if normalized < KEYPOINT_SIM_THRESHOLD:
                    missing.append(keypoint)

            coverage = sum(scores) / (len(scores) or 1)

        combined = (EMBEDDING_WEIGHT * cosine) + (KEYPOINT_WEIGHT * coverage)
        combined = float(np.clip(combined, 0.0, 1.0))

        return ScoreComponents(
            score=combined,
            cosine=cosine,
            coverage=coverage,
            missing_keypoints=missing
        )

    def state(self) -> str:
        return self._state

    def status(self) -> ModelCacheStatus:
        return ModelCacheStatus(state=self._state, message=self._state_detail)


_SCORER = EmbeddingScorer()


def _generate_feedback(verdict: Verdict, components: ScoreComponents, keypoints: List[str]) -> Optional[str]:
    """Generate contextual feedback based on the verdict and score components."""
    feedback_parts: List[str] = []

    # Provide verdict-specific feedback
    if verdict == Verdict.correct:
        if components.missing_keypoints:
            feedback_parts.append(f"Great job! Your answer is correct, but consider including: {', '.join(components.missing_keypoints)}")
        else:
            feedback_parts.append("Excellent! Your answer covers all key concepts.")

    elif verdict == Verdict.almost:
        if components.missing_keypoints:
            count = len(components.missing_keypoints)
            plural = "keyword" if count == 1 else "keywords"
            feedback_parts.append(f"You're on the right track! Missing {count} key {plural}: {', '.join(components.missing_keypoints)}")
        else:
            feedback_parts.append("Close! Your understanding is good, but try to be more precise or complete.")

    elif verdict == Verdict.missing:
        if components.missing_keypoints:
            feedback_parts.append(f"Partially correct. You're missing important concepts: {', '.join(components.missing_keypoints)}")
        else:
            feedback_parts.append("Your answer covers some concepts but needs more detail or accuracy.")
        if keypoints:
            feedback_parts.append("Review the expected answer below to see what you missed.")

    elif verdict == Verdict.incorrect:
        if components.missing_keypoints:
            feedback_parts.append(f"Your answer doesn't match the expected response. Key concepts missing: {', '.join(components.missing_keypoints)}")
        else:
            feedback_parts.append("This answer doesn't align with the expected response.")
        feedback_parts.append("Please review the expected answer below and try again.")

    # Add coverage hint for low coverage
    if keypoints and components.coverage < 0.5:
        covered_count = len(keypoints) - len(components.missing_keypoints)
        total_count = len(keypoints)
        feedback_parts.append(f"(Covered {covered_count}/{total_count} key concepts)")

    return " ".join(feedback_parts).strip() or None


def _classify(score: float) -> Verdict:
    for verdict, threshold in SCORE_THRESHOLDS:
        if score >= threshold:
            return verdict
    if score >= MIN_BORDERLINE_SCORE:
        return Verdict.missing
    return Verdict.incorrect


def _downgrade(verdict: Verdict) -> Verdict:
    try:
        idx = VERDICT_SEQUENCE.index(verdict)
    except ValueError:
        return verdict
    if idx + 1 >= len(VERDICT_SEQUENCE):
        return VERDICT_SEQUENCE[-1]
    return VERDICT_SEQUENCE[idx + 1]


async def score_answer(payload: ScoreRequest) -> ScoreResult:
    """Score a user answer using semantic similarity and keypoint coverage."""

    return await _SCORER.score(payload)


async def warm_model_cache() -> None:
    await _SCORER.warm()


def get_model_cache_state() -> str:
    return _SCORER.state()


def get_model_cache_status() -> ModelCacheStatus:
    return _SCORER.status()
