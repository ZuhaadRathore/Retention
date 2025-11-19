import type { CardSummary } from "../types/deck";
import type { Verdict } from "../types/study";

export type SessionPhase = "empty" | "prompt" | "review" | "complete";

export type SessionActionKind =
  | "bootstrap"
  | "setActive"
  | "check"
  | "backOfPile"
  | "next"
  | "markLearned"
  | "syncCard"
  | "reset";

export interface SessionCompletedEntry {
  card: CardSummary;
  action: "next" | "markLearned" | "backOfPile";
  completedAt: string;
  verdict?: Verdict;
}

export interface SessionQueueState {
  deckId: string | null;
  active: CardSummary | null;
  queue: CardSummary[];
  completed: SessionCompletedEntry[];
  phase: SessionPhase;
  lastAction: SessionActionKind | null;
  total: number;
}

export type SessionQueueAction =
  | { type: "bootstrap"; deckId: string; cards: CardSummary[] }
  | { type: "setActive"; cardId: string | null }
  | { type: "check" }
  | { type: "backOfPile"; verdict?: Verdict }
  | { type: "next"; verdict?: Verdict }
  | { type: "markLearned"; verdict?: Verdict }
  | { type: "syncCard"; card: CardSummary }
  | { type: "reset" };

export const initialSessionState: SessionQueueState = {
  deckId: null,
  active: null,
  queue: [],
  completed: [],
  phase: "empty",
  lastAction: null,
  total: 0
};

export function sessionQueueReducer(
  state: SessionQueueState,
  action: SessionQueueAction
): SessionQueueState {
  switch (action.type) {
    case "bootstrap": {
      const sortedCards = sortCardsForSession(action.cards);
      const [first, ...rest] = sortedCards;
      return {
        deckId: action.deckId,
        active: first ?? null,
        queue: rest,
        completed: [],
        phase: first ? "prompt" : "empty",
        lastAction: "bootstrap",
        total: sortedCards.length
      };
    }
    case "setActive": {
      if (action.cardId === null) {
        const queue = state.active ? [cloneCard(state.active), ...state.queue] : state.queue;
        return {
          ...state,
          active: null,
          queue,
          phase: queue.length > 0 ? "prompt" : "empty",
          lastAction: "setActive"
        };
      }
      if (state.active?.id === action.cardId) {
        return {
          ...state,
          phase: state.phase === "empty" ? "prompt" : state.phase,
          lastAction: "setActive"
        };
      }
      const nextQueue: CardSummary[] = [];
      let selected: CardSummary | null = null;
      for (const card of state.queue) {
        if (card.id === action.cardId) {
          selected = cloneCard(card);
        } else {
          nextQueue.push(card);
        }
      }
      if (!selected) {
        const completedIndex = state.completed.findIndex(
          (entry) => entry.card.id === action.cardId
        );
        if (completedIndex >= 0) {
          selected = cloneCard(state.completed[completedIndex].card);
          // Keep the card in completed array to preserve session statistics
          // Only move current active card back to queue if exists
          const queue = state.active ? [cloneCard(state.active), ...state.queue] : state.queue;
          return {
            ...state,
            active: selected,
            queue,
            phase: "prompt",
            lastAction: "setActive"
          };
        }
        return state;
      }
      const queue = state.active ? [cloneCard(state.active), ...nextQueue] : nextQueue;
      return {
        ...state,
        active: selected,
        queue,
        phase: "prompt",
        lastAction: "setActive"
      };
    }
    case "check": {
      if (!state.active) {
        return state;
      }
      return {
        ...state,
        phase: "review",
        lastAction: "check"
      };
    }
    case "backOfPile": {
      if (!state.active) {
        return state;
      }
      const queueWithActive = [...state.queue, cloneCard(state.active)];
      const [nextActive, ...remaining] = queueWithActive;
      const completedEntry: SessionCompletedEntry = {
        card: cloneCard(state.active),
        action: "backOfPile",
        completedAt: new Date().toISOString(),
        verdict: action.verdict
      };
      return {
        ...state,
        active: nextActive ?? null,
        queue: remaining,
        completed: [...state.completed, completedEntry],
        phase: nextActive ? "prompt" : "complete",
        lastAction: "backOfPile"
      };
    }
    case "next": {
      if (!state.active) {
        return state;
      }
      const [nextActive, ...restQueue] = state.queue;
      const completedEntry: SessionCompletedEntry = {
        card: cloneCard(state.active),
        action: "next",
        completedAt: new Date().toISOString(),
        verdict: action.verdict
      };
      return {
        ...state,
        active: nextActive ?? null,
        queue: restQueue,
        completed: [...state.completed, completedEntry],
        phase: nextActive ? "prompt" : "complete",
        lastAction: "next"
      };
    }
    case "markLearned": {
      if (!state.active) {
        return state;
      }
      const [nextActive, ...restQueue] = state.queue;
      const completedEntry: SessionCompletedEntry = {
        card: cloneCard(state.active),
        action: "markLearned",
        completedAt: new Date().toISOString(),
        verdict: action.verdict
      };
      return {
        ...state,
        active: nextActive ?? null,
        queue: restQueue,
        completed: [...state.completed, completedEntry],
        phase: nextActive ? "prompt" : "complete",
        lastAction: "markLearned"
      };
    }
    case "syncCard": {
      const target = cloneCard(action.card);
      let changed = false;
      let active = state.active;
      if (state.active?.id === target.id) {
        active = mergeCards(state.active, target);
        changed = true;
      }
      const queue = state.queue.map((card) => {
        if (card.id === target.id) {
          changed = true;
          return mergeCards(card, target);
        }
        return card;
      });
      const completed = state.completed.map((entry) => {
        if (entry.card.id === target.id) {
          changed = true;
          return {
            ...entry,
            card: mergeCards(entry.card, target)
          };
        }
        return entry;
      });
      if (!changed) {
        return state;
      }
      return {
        ...state,
        active,
        queue,
        completed,
        lastAction: "syncCard"
      };
    }
    case "reset":
      return initialSessionState;
    default:
      return state;
  }
}

function sortCardsForSession(cards: CardSummary[]): CardSummary[] {
  return cards
    .map(cloneCard)
    .filter((card) => !card.archived); // Filter out archived cards
}

function cloneCard(card: CardSummary): CardSummary {
  return {
    ...card,
    keypoints: card.keypoints ? [...card.keypoints] : undefined
  };
}

function mergeCards(existing: CardSummary, incoming: CardSummary): CardSummary {
  return {
    ...existing,
    ...incoming,
    keypoints: incoming.keypoints ?? existing.keypoints
  };
}
