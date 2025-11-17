import { api } from "./api";
import type { ScoreRequest, AttemptRecord as ApiAttemptRecord } from "./api";
import type { AttemptRecord, ScoreRequestPayload } from "../types/study";

const DEFAULT_HISTORY_LIMIT = 20;

/**
 * Convert study types to API types for the request
 */
function toScoreRequest(payload: ScoreRequestPayload): ScoreRequest {
  return {
    cardId: payload.cardId,
    prompt: payload.prompt,
    expectedAnswer: payload.expectedAnswer,
    keypoints: payload.keypoints,
    userAnswer: payload.userAnswer,
    alternativeAnswers: payload.alternativeAnswers
  };
}

/**
 * Convert API attempt record to study attempt record
 */
function toAttemptRecord(apiRecord: ApiAttemptRecord): AttemptRecord {
  return {
    id: apiRecord.id,
    cardId: apiRecord.cardId,
    userAnswer: apiRecord.userAnswer,
    verdict: apiRecord.verdict as AttemptRecord['verdict'],
    score: apiRecord.score,
    cosine: apiRecord.cosine,
    coverage: apiRecord.coverage,
    missingKeypoints: apiRecord.missingKeypoints ?? [],
    feedback: apiRecord.feedback,
    prompt: apiRecord.prompt,
    expectedAnswer: apiRecord.expectedAnswer,
    keypoints: apiRecord.keypoints ?? [],
    createdAt: apiRecord.createdAt,
    schedule: apiRecord.schedule
  };
}

/**
 * Score an answer via the backend API and persist the resulting attempt.
 * The backend stores the attempt in SQLite and returns the saved record.
 */
export async function recordAttempt(payload: ScoreRequestPayload): Promise<AttemptRecord> {
  const apiPayload = toScoreRequest(payload);
  const apiRecord = await api.scoreAnswer(apiPayload);
  return toAttemptRecord(apiRecord);
}

/**
 * Retrieve recent attempts for a given card from the backend database.
 */
export async function fetchAttemptHistory(cardId: string, limit = DEFAULT_HISTORY_LIMIT): Promise<AttemptRecord[]> {
  const apiRecords = await api.listAttempts(cardId, limit);
  return apiRecords.map(toAttemptRecord);
}
