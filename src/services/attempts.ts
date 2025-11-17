import { api } from "./api";
import type { AttemptRecord, ScoreRequestPayload } from "../types/study";

const DEFAULT_HISTORY_LIMIT = 20;

/**
 * Score an answer via the backend API and persist the resulting attempt.
 * The backend stores the attempt in SQLite and returns the saved record.
 */
export async function recordAttempt(payload: ScoreRequestPayload): Promise<AttemptRecord> {
  return api.scoreAnswer(payload as any) as any;
}

/**
 * Retrieve recent attempts for a given card from the backend database.
 */
export async function fetchAttemptHistory(cardId: string, limit = DEFAULT_HISTORY_LIMIT): Promise<AttemptRecord[]> {
  return api.listAttempts(cardId, limit) as any;
}
