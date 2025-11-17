import { afterEach, beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";

vi.mock("../services/attempts", () => ({
  recordAttempt: vi.fn(),
  fetchAttemptHistory: vi.fn(),
}));

import { useStudyStore } from "./studyStore";
import { initialSessionState, sessionQueueReducer } from "./sessionQueue";
import type { SessionQueueState } from "./sessionQueue";
import type { CardSummary } from "../types/deck";
import type { AttemptRecord, ScoreRequestPayload, Verdict } from "../types/study";
import { recordAttempt } from "../services/attempts";

type AttemptFixture = {
  attempt: AttemptRecord;
  payload: ScoreRequestPayload;
  description: string;
};

const FIXED_TIMESTAMP = "2024-02-01T00:00:00.000Z";

const recordAttemptMock = recordAttempt as MockedFunction<typeof recordAttempt>;

function makeAttempt(config: {
  id: string;
  cardId: string;
  verdict: Verdict;
  score: number;
  cosine: number;
  coverage: number;
  missingKeypoints?: string[];
  feedback?: string | null;
  keypoints?: string[];
}): AttemptRecord {
  const keypoints = config.keypoints ?? [];
  return {
    id: config.id,
    cardId: config.cardId,
    userAnswer: "User answer",
    verdict: config.verdict,
    score: config.score,
    cosine: config.cosine,
    coverage: config.coverage,
    missingKeypoints: [...(config.missingKeypoints ?? [])],
    feedback: config.feedback ?? null,
    prompt: "Prompt text",
    expectedAnswer: "Reference answer",
    keypoints,
    createdAt: FIXED_TIMESTAMP,
    schedule: undefined,
  };
}

function makeAttemptCase(config: {
  id: string;
  cardId: string;
  verdict: Verdict;
  score: number;
  cosine: number;
  coverage: number;
  missingKeypoints?: string[];
  feedback?: string | null;
  keypoints?: string[];
  description: string;
}): AttemptFixture {
  const attempt = makeAttempt(config);
  const payload: ScoreRequestPayload = {
    cardId: attempt.cardId,
    prompt: attempt.prompt ?? "Prompt text",
    expectedAnswer: attempt.expectedAnswer ?? "Reference answer",
    keypoints: [...attempt.keypoints],
    userAnswer: attempt.userAnswer,
  };
  return { attempt, payload, description: config.description };
}

const STORE_REGRESSION_FIXTURES: AttemptFixture[] = [
  makeAttemptCase({
    id: "attempt-correct-threshold",
    cardId: "card-correct",
    verdict: "correct",
    score: 0.86,
    cosine: 0.88,
    coverage: 0.9,
    keypoints: [],
    description: "verdict correct at rubric threshold",
  }),
  makeAttemptCase({
    id: "attempt-almost-threshold",
    cardId: "card-almost",
    verdict: "almost",
    score: 0.76,
    cosine: 0.8,
    coverage: 0.74,
    keypoints: ["metabolism"],
    description: "verdict almost at rubric threshold",
  }),
  makeAttemptCase({
    id: "attempt-missing-threshold",
    cardId: "card-missing",
    verdict: "missing",
    score: 0.72,
    cosine: 0.7,
    coverage: 0.68,
    keypoints: ["glucose regulation", "insulin response"],
    missingKeypoints: ["insulin response"],
    feedback: "Missing keypoints: insulin response",
    description: "verdict missing at rubric threshold",
  }),
  makeAttemptCase({
    id: "attempt-incorrect",
    cardId: "card-incorrect",
    verdict: "incorrect",
    score: 0.59,
    cosine: 0.55,
    coverage: 0.4,
    keypoints: ["oxidation"],
    missingKeypoints: ["oxidation"],
    feedback: "Missing keypoints: oxidation Review the reference answer for more context.",
    description: "verdict incorrect below borderline floor",
  }),
];

function blankSessionState() {
  return {
    deckId: initialSessionState.deckId,
    active: initialSessionState.active,
    queue: [...initialSessionState.queue],
    completed: [...initialSessionState.completed],
    phase: initialSessionState.phase,
    lastAction: initialSessionState.lastAction,
    total: initialSessionState.total,
  };
}

function buildActiveCard(attempt: AttemptRecord): CardSummary {
  return {
    id: attempt.cardId,
    prompt: attempt.prompt ?? "Prompt text",
    keypointCount: attempt.keypoints.length,
    answer: attempt.expectedAnswer ?? undefined,
    keypoints: [...attempt.keypoints],
    schedule: undefined,
  };
}

function resetStoreState() {
  useStudyStore.setState({
    activeCardId: null,
    status: "idle",
    error: undefined,
    lastAttempt: null,
    attemptsByCard: {},
    session: blankSessionState(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_TIMESTAMP));
  recordAttemptMock.mockReset();
  resetStoreState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useStudyStore.submitAnswer", () => {
  it.each(STORE_REGRESSION_FIXTURES)("$description", async ({ attempt, payload }) => {
    const activeCard = buildActiveCard(attempt);
    useStudyStore.setState({
      session: {
        deckId: "deck-1",
        active: activeCard,
        queue: [],
        completed: [],
        phase: "prompt",
        lastAction: null,
        total: 1,
      },
      activeCardId: activeCard.id,
    });

    recordAttemptMock.mockResolvedValueOnce(attempt);

    const result = await useStudyStore.getState().submitAnswer(payload);
    const state = useStudyStore.getState();

    expect(recordAttemptMock).toHaveBeenCalledWith(payload);
    expect(result).toEqual(attempt);
    expect(state.status).toBe("idle");
    expect(state.error).toBeUndefined();
    expect(state.lastAttempt).toEqual(attempt);
    expect(state.attemptsByCard[attempt.cardId]).toBeDefined();
    expect(state.attemptsByCard[attempt.cardId][0]).toEqual(attempt);
    expect(state.session.phase).toBe("review");
    expect(state.session.lastAction).toBe("check");
    expect(state.session.active?.id).toBe(attempt.cardId);
    expect(state.activeCardId).toBe(attempt.cardId);
    expect(state.lastAttempt?.verdict).toBe(attempt.verdict);
    expect(state.lastAttempt?.missingKeypoints).toEqual(attempt.missingKeypoints);
    expect(state.lastAttempt?.feedback ?? null).toBe(attempt.feedback ?? null);
  });
});

describe("sessionQueueReducer verdict propagation", () => {
  it("stores the verdict when advancing to the next card", () => {
    const activeCard: CardSummary = {
      id: "card-1",
      prompt: "Prompt text",
      keypointCount: 1,
      keypoints: ["detail"],
      answer: "Reference answer",
      schedule: undefined,
    };
    const state: SessionQueueState = {
      deckId: "deck-1",
      active: activeCard,
      queue: [],
      completed: [],
      phase: "review",
      lastAction: "check",
      total: 1,
    };

    const nextState = sessionQueueReducer(state, { type: "next", verdict: "missing" });
    expect(nextState.completed).toHaveLength(1);
    expect(nextState.completed[0].verdict).toBe("missing");
    expect(nextState.completed[0].card.id).toBe(activeCard.id);
    expect(Date.parse(nextState.completed[0].completedAt)).not.toBeNaN();
  });

  it("stores the verdict when marking a card learned", () => {
    const activeCard: CardSummary = {
      id: "card-2",
      prompt: "Prompt text",
      keypointCount: 2,
      keypoints: ["alpha", "beta"],
      answer: "Reference answer",
      schedule: undefined,
    };
    const state: SessionQueueState = {
      deckId: "deck-1",
      active: activeCard,
      queue: [],
      completed: [],
      phase: "review",
      lastAction: "check",
      total: 1,
    };

    const nextState = sessionQueueReducer(state, { type: "markLearned", verdict: "correct" });
    expect(nextState.completed).toHaveLength(1);
    expect(nextState.completed[0].verdict).toBe("correct");
    expect(nextState.completed[0].card.id).toBe(activeCard.id);
    expect(Date.parse(nextState.completed[0].completedAt)).not.toBeNaN();
  });
});
