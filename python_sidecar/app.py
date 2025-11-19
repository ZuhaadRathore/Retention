from __future__ import annotations

import os
import time
from collections import defaultdict
from typing import Dict, List, Tuple

from fastapi import FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .db import Database
from .models import AttemptRecord, BulkCardOperation, DeckIn, DeckRecord, DeckUpdate, HealthStatus, ScoreRequest
from .scoring import get_model_cache_status, score_answer, warm_model_cache

app = FastAPI(title="Retention Backend", version="0.1.0")

# Configure CORS - Security: Restrict to only necessary methods and headers
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:1420,http://127.0.0.1:1420,https://tauri.localhost").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],  # Only allow necessary HTTP methods
    allow_headers=["Content-Type", "Authorization", "Accept"],  # Only allow necessary headers
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Simple in-memory rate limiter
# Format: {endpoint: {client_ip: (request_count, window_start_time)}}
_rate_limit_store: Dict[str, Dict[str, Tuple[int, float]]] = defaultdict(lambda: defaultdict(lambda: (0, 0.0)))
_RATE_LIMIT_WINDOW = 60  # 60 seconds window
_RATE_LIMIT_MAX_REQUESTS = {
    "/score": 30,  # 30 requests per minute for scoring
    "/decks": 60,  # 60 requests per minute for deck operations
}


def check_rate_limit(endpoint: str, client_ip: str) -> None:
    """
    Simple rate limiting check. Raises HTTPException if limit exceeded.
    """
    if endpoint not in _RATE_LIMIT_MAX_REQUESTS:
        return  # No rate limit for this endpoint

    max_requests = _RATE_LIMIT_MAX_REQUESTS[endpoint]
    current_time = time.time()

    request_count, window_start = _rate_limit_store[endpoint][client_ip]

    # Reset window if expired
    if current_time - window_start > _RATE_LIMIT_WINDOW:
        _rate_limit_store[endpoint][client_ip] = (1, current_time)
        return

    # Check if limit exceeded
    if request_count >= max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Maximum {max_requests} requests per {_RATE_LIMIT_WINDOW} seconds."
        )

    # Increment counter
    _rate_limit_store[endpoint][client_ip] = (request_count + 1, window_start)


_database = Database()


@app.on_event("startup")
async def startup() -> None:
    await _database.initialize()
    # Start model warming in background - don't await to avoid blocking startup
    import asyncio
    import sys

    async def warm_with_logging():
        try:
            await warm_model_cache()
        except Exception as e:
            print(f"[model] ERROR: Failed to warm model cache: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc()

    asyncio.create_task(warm_with_logging())


@app.on_event("shutdown")
async def shutdown() -> None:
    await _database.close()


@app.get("/health", response_model=HealthStatus)
async def health() -> HealthStatus:
    database_state = _database.state
    if database_state == "closed":
        database_state = "ready"
    if database_state == "cold" and _database.path.exists():
        database_state = "initializing"
    model_status = get_model_cache_status()
    overall_status = "ok"
    if database_state == "error" or model_status.state == "error":
        overall_status = "error"
    elif database_state not in {"ready", "closed"} or model_status.state != "ready":
        overall_status = "initializing"
    return HealthStatus(
        status=overall_status,
        database=database_state,
        model_cache=model_status.state,
        model_cache_message=model_status.message
    )


@app.post("/score", response_model=AttemptRecord)
async def score(payload: ScoreRequest, request: Request) -> AttemptRecord:
    # Rate limiting for resource-intensive scoring endpoint
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit("/score", client_ip)

    result = await score_answer(payload)
    return await _database.record_attempt(payload, result)


@app.get("/decks", response_model=List[DeckRecord])
async def list_decks(request: Request) -> List[DeckRecord]:
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit("/decks", client_ip)

    return await _database.list_decks()


@app.post("/decks", response_model=DeckRecord, status_code=status.HTTP_201_CREATED)
async def create_deck(payload: DeckIn) -> DeckRecord:
    return await _database.create_deck(payload)


@app.put("/decks/{deck_id}", response_model=DeckRecord)
async def update_deck(deck_id: str, payload: DeckUpdate) -> DeckRecord:
    deck = await _database.update_deck(deck_id, payload)
    if deck is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="deck not found")
    return deck


@app.delete("/decks/{deck_id}")
async def delete_deck(deck_id: str) -> Response:
    deck = await _database.get_deck(deck_id)
    if deck is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="deck not found")
    await _database.delete_deck(deck_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/cards/{card_id}/attempts", response_model=List[AttemptRecord])
async def card_attempts(card_id: str, limit: int = Query(default=50, ge=1, le=500)) -> List[AttemptRecord]:
    return await _database.list_attempts(card_id, limit)


@app.post("/decks/{deck_id}/bulk", response_model=DeckRecord)
async def bulk_update_cards(deck_id: str, operation: BulkCardOperation) -> DeckRecord:
    deck = await _database.bulk_update_cards(deck_id, operation.card_ids, operation.operation)
    if deck is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="deck or cards not found")
    return deck


@app.post("/warm-model")
async def warm_model() -> HealthStatus:
    """Manually trigger model cache warming. Returns health status after warming."""
    await warm_model_cache()
    model_status = get_model_cache_status()
    database_state = _database.state
    if database_state == "closed":
        database_state = "ready"
    overall_status = "ok"
    if database_state == "error" or model_status.state == "error":
        overall_status = "error"
    elif database_state not in {"ready", "closed"} or model_status.state != "ready":
        overall_status = "initializing"
    return HealthStatus(
        status=overall_status,
        database=database_state,
        model_cache=model_status.state,
        model_cache_message=model_status.message
    )


