import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { fetchAttemptHistory, recordAttempt } from "../services/attempts";
import type { CardSummary } from "../types/deck";
import type { AttemptRecord, ScoreRequestPayload } from "../types/study";
import {
  initialSessionState,
  sessionQueueReducer,
  type SessionQueueAction,
  type SessionQueueState
} from "./sessionQueue";

type StudyStatus = "idle" | "scoring" | "error";

interface StudyState {
  activeCardId: string | null;
  status: StudyStatus;
  error?: string;
  lastAttempt: AttemptRecord | null;
  attemptsByCard: Record<string, AttemptRecord[]>;
  session: SessionQueueState;
  sessionStartedAt: number | null;
  startSession: (deckId: string, cards: CardSummary[]) => void;
  dispatchSession: (action: SessionQueueAction) => void;
  selectCard: (cardId: string | null) => void;
  submitAnswer: (payload: ScoreRequestPayload) => Promise<AttemptRecord | null>;
  fetchAttempts: (
    cardId: string,
    options?: { limit?: number; force?: boolean }
  ) => Promise<AttemptRecord[]>;
  resetSession: () => void;
  clearError: () => void;
}

const MAX_CACHED_ATTEMPTS = 50;

function deriveSessionState(
  previousAttempt: AttemptRecord | null,
  session: SessionQueueState
): Pick<StudyState, "session" | "activeCardId" | "lastAttempt"> {
  const activeCardId = session.active?.id ?? null;
  const lastAttempt =
    previousAttempt && previousAttempt.cardId === activeCardId ? previousAttempt : null;
  return {
    session,
    activeCardId,
    lastAttempt
  };
}

const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export const useStudyStore = create<StudyState>()(
  persist(
    (set, get) => ({
      activeCardId: null,
      status: "idle",
      error: undefined,
      lastAttempt: null,
      attemptsByCard: {},
      session: initialSessionState,
      sessionStartedAt: null,
      startSession(deckId, cards) {
        const session = sessionQueueReducer(initialSessionState, { type: "bootstrap", deckId, cards });
        set(() => ({
          ...deriveSessionState(null, session),
          sessionStartedAt: Date.now(),
          error: undefined
        }));
        const active = get().session.active;
        if (active) {
          void get()
            .fetchAttempts(active.id, { limit: 20, force: true })
            .catch(() => {
              /* errors captured in store */
            });
        }
      },
  dispatchSession(action) {
    const previousActive = get().session.active?.id ?? null;
    set((state) => ({
      ...deriveSessionState(state.lastAttempt, sessionQueueReducer(state.session, action))
    }));
    const nextActive = get().session.active?.id ?? null;
    if (
      nextActive &&
      nextActive !== previousActive &&
      action.type !== "check" &&
      action.type !== "syncCard"
    ) {
      void get()
        .fetchAttempts(nextActive, { limit: 20 })
        .catch(() => {
          /* errors captured in store */
        });
    }
  },
  selectCard(cardId) {
    if (cardId === null) {
      set((state) => ({
        ...deriveSessionState(
          null,
          sessionQueueReducer(state.session, { type: "setActive", cardId: null })
        ),
        error: undefined
      }));
      return;
    }
    const previousActive = get().session.active?.id ?? null;
    set((state) => ({
      ...deriveSessionState(
        state.lastAttempt,
        sessionQueueReducer(state.session, { type: "setActive", cardId })
      ),
      error: undefined
    }));
    const nextActive = get().session.active?.id ?? null;
    if (nextActive && (nextActive !== previousActive || !get().attemptsByCard[nextActive])) {
      void get()
        .fetchAttempts(nextActive, { limit: 20 })
        .catch(() => {
          /* errors captured in store */
        });
    }
  },
  async submitAnswer(payload) {
    set({ status: "scoring", error: undefined });
    try {
      const attempt = await recordAttempt(payload);
      set((state) => {
        const existing = state.attemptsByCard[payload.cardId] ?? [];
        const nextAttempts = [attempt, ...existing].slice(0, MAX_CACHED_ATTEMPTS);
        let session = sessionQueueReducer(state.session, { type: "check" });
        return {
          status: "idle" as StudyStatus,
          lastAttempt: attempt,
          attemptsByCard: {
            ...state.attemptsByCard,
            [payload.cardId]: nextAttempts
          },
          session,
          activeCardId: session.active?.id ?? null
        };
      });
      return attempt;
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);

      // Detect connection/timeout errors and provide helpful message
      const isConnectionError =
        rawMessage.toLowerCase().includes("timeout") ||
        rawMessage.toLowerCase().includes("connection") ||
        rawMessage.toLowerCase().includes("network") ||
        rawMessage.toLowerCase().includes("fetch") ||
        rawMessage.toLowerCase().includes("unreachable");

      const userMessage = isConnectionError
        ? "Cannot reach the sidecar service. The request timed out or the sidecar may be offline. Please check the Sidecar Diagnostics section below."
        : rawMessage;

      set({
        status: "error",
        error: userMessage
      });
      return null;
    }
  },
  async fetchAttempts(cardId, options) {
    const { limit = 20, force = false } = options ?? {};
    const existing = get().attemptsByCard[cardId];
    if (existing && existing.length > 0 && !force) {
      return existing;
    }
    try {
      const attempts = await fetchAttemptHistory(cardId, limit);
      set((state) => ({
        attemptsByCard: {
          ...state.attemptsByCard,
          [cardId]: attempts
        },
        error: undefined
      }));
      return attempts;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // If card was deleted (404 or "not found" errors), silently return empty array
      // Otherwise, set error state to notify user of real problems
      const isNotFoundError =
        message.toLowerCase().includes("not found") ||
        message.toLowerCase().includes("404") ||
        message.toLowerCase().includes("does not exist");

      if (isNotFoundError) {
        // Card was likely deleted - cache empty array and don't show error
        console.warn(`Card ${cardId} not found - may have been deleted`);
        set((state) => ({
          attemptsByCard: {
            ...state.attemptsByCard,
            [cardId]: []
          }
        }));
        return [];
      }

      // Real error - show to user
      set({ error: message });
      return [];
    }
  },
  resetSession() {
    set({
      session: initialSessionState,
      activeCardId: null,
      lastAttempt: null,
      sessionStartedAt: null
    });
  },
  clearError() {
    set({ error: undefined });
  }
    }),
    {
      name: "retention-study-session",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        session: state.session,
        activeCardId: state.activeCardId,
        lastAttempt: state.lastAttempt,
        attemptsByCard: state.attemptsByCard,
        sessionStartedAt: state.sessionStartedAt
      }),
      migrate: (persistedState: any, version: number) => {
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState;
        }

        const sessionAge = persistedState.sessionStartedAt
          ? Date.now() - persistedState.sessionStartedAt
          : Number.POSITIVE_INFINITY;

        if (sessionAge > MAX_SESSION_AGE_MS) {
          return {
            session: initialSessionState,
            activeCardId: null,
            lastAttempt: null,
            attemptsByCard: {},
            sessionStartedAt: null
          };
        }

        return persistedState;
      }
    }
  )
);
