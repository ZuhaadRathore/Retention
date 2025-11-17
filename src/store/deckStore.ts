import { create } from "zustand";

import { api } from "../services/api";
import type { BulkCardOperation, CardSchedule, Deck, DeckPayload, DeckUpdatePayload } from "../types/deck";

type DeckStatus = "idle" | "loading" | "error";

type DeckState = {
  decks: Deck[];
  selectedDeckId: string | null;
  status: DeckStatus;
  error?: string;
  initialize: () => Promise<void>;
  selectDeck: (id: string | null) => void;
  addDeck: (payload: DeckPayload) => Promise<boolean>;
  updateDeck: (id: string, payload: DeckUpdatePayload) => Promise<boolean>;
  removeDeck: (id: string) => Promise<boolean>;
  bulkUpdateCards: (deckId: string, operation: BulkCardOperation) => Promise<boolean>;
};

const MAX_DECKS_RETURNED = 200;

function normalizeSchedule(schedule?: CardSchedule | null): CardSchedule | undefined {
  if (!schedule) {
    return undefined;
  }
  return {
    dueAt: schedule.dueAt,
    interval: schedule.interval,
    ease: schedule.ease,
    streak: schedule.streak,
    quality: schedule.quality ?? null
  };
}

function normalizeDeck(deck: Deck): Deck {
  return {
    ...deck,
    cards: deck.cards.map((card) => ({
      ...card,
      keypointCount: card.keypointCount ?? card.keypoints?.length ?? 0,
      schedule: normalizeSchedule(card.schedule)
    })),
    cardCount: deck.cardCount ?? deck.cards.length
  };
}

function sortDecks(decks: Deck[]): Deck[] {
  return [...decks].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export const useDeckStore = create<DeckState>((set, get) => ({
  decks: [],
  selectedDeckId: null,
  status: "idle",
  error: undefined,
  async initialize() {
    const { status } = get();
    if (status === "loading") {
      return;
    }

    set({ status: "loading", error: undefined });
    try {
      const response = await api.listDecks();
      const decks = sortDecks(response.slice(0, MAX_DECKS_RETURNED).map(normalizeDeck as any));
      set({
        decks,
        selectedDeckId: decks[0]?.id ?? null,
        status: "idle"
      });
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },
  selectDeck(id) {
    set({ selectedDeckId: id });
  },
  async addDeck(payload) {
    set({ status: "loading", error: undefined });
    try {
      const deck = await api.createDeck(payload as any);
      const prepared = normalizeDeck(deck as any);
      set((state) => {
        const filtered = state.decks.filter((item) => item.id !== prepared.id);
        const decks = sortDecks([prepared, ...filtered]);
        return {
          decks,
          selectedDeckId: prepared.id,
          status: "idle"
        };
      });
      return true;
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  },
  async updateDeck(id, payload) {
    set({ status: "loading", error: undefined });
    try {
      const deck = await api.updateDeck(id, payload as any);
      const prepared = normalizeDeck(deck as any);
      set((state) => {
        const filtered = state.decks.filter((item) => item.id !== prepared.id);
        const decks = sortDecks([prepared, ...filtered]);
        return {
          decks,
          selectedDeckId: state.selectedDeckId ?? prepared.id,
          status: "idle"
        };
      });
      return true;
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  },
  async removeDeck(id) {
    set({ status: "loading", error: undefined });
    try {
      await api.deleteDeck(id);
      set((state) => {
        const decks = state.decks.filter((deck) => deck.id !== id);
        const selectedDeckId =
          state.selectedDeckId === id ? decks[0]?.id ?? null : state.selectedDeckId;
        return {
          decks,
          selectedDeckId,
          status: "idle"
        };
      });
      return true;
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  },
  async bulkUpdateCards(deckId, operation) {
    set({ status: "loading", error: undefined });
    try {
      const deck = await api.bulkUpdateCards(deckId, operation as any);
      const prepared = normalizeDeck(deck as any);
      set((state) => {
        const filtered = state.decks.filter((item) => item.id !== prepared.id);
        const decks = sortDecks([prepared, ...filtered]);
        return {
          decks,
          status: "idle"
        };
      });
      return true;
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
}));
