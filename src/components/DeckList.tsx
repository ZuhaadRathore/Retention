import { useState, useMemo } from "react";
import { useDeckStore } from "../store/deckStore";
import { formatRelativeTime } from "../utils/time";

function requestDeckCreation() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event("retention:create-deck"));
}

function calculateDeckProgress(deck: { cards: Array<{ schedule?: { dueAt: string } | null }> }) {
  const now = new Date();
  const dueCards = deck.cards.filter((card) => {
    if (!card.schedule?.dueAt) return false;
    return new Date(card.schedule.dueAt) <= now;
  }).length;

  const studiedCards = deck.cards.filter((card) => card.schedule !== null && card.schedule !== undefined).length;

  return { dueCards, studiedCards };
}

export function DeckList() {
  const { decks, selectedDeckId, selectDeck, status, error } = useDeckStore((state) => ({
    decks: state.decks,
    selectedDeckId: state.selectedDeckId,
    selectDeck: state.selectDeck,
    status: state.status,
    error: state.error
  }));

  const [searchQuery, setSearchQuery] = useState("");

  const filteredDecks = useMemo(() => {
    if (!searchQuery.trim()) return decks;

    const query = searchQuery.toLowerCase();
    return decks.filter((deck) => {
      const titleMatch = deck.title.toLowerCase().includes(query);
      const descMatch = deck.description?.toLowerCase().includes(query);
      return titleMatch || descMatch;
    });
  }, [decks, searchQuery]);

  const busy = status === "loading";

  const handleCreate = () => {
    if (busy) {
      return;
    }
    selectDeck(null);
    requestDeckCreation();
  };

  if (status === "loading") {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold m-0 text-text-color font-display">Decks</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-primary">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
          </div>
          <span>Loading decks...</span>
        </div>
      </div>
    );
  }

  if (status === "error" && decks.length === 0) {
    return <p className="text-sm text-incorrect-red font-medium">Failed to load decks{error ? ": " + error : "."}</p>;
  }

  if (decks.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold m-0 text-text-color font-display">Decks</h2>
          <button
            type="button"
            className="px-4 py-2 rounded-full bg-primary text-white font-bold hand-drawn-btn hover:bg-primary-dark disabled:opacity-50 text-sm shadow-md"
            onClick={handleCreate}
            disabled={busy}
          >
            New
          </button>
        </div>
        <p className="text-sm text-text-muted italic">No decks yet. Create one to get started!</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold m-0 text-text-color font-display">Decks</h2>
        <button
          type="button"
          className="px-4 py-2 rounded-full bg-primary text-white font-bold hand-drawn-btn hover:bg-primary-dark disabled:opacity-50 text-sm shadow-md"
          onClick={handleCreate}
          disabled={busy}
        >
          New
        </button>
      </div>

      {/* Search bar */}
      {decks.length > 0 && (
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search decks..."
            className="w-full hand-drawn-input text-text-color focus:outline-none text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      {busy && <p className="text-xs text-primary font-medium mb-2">Syncing deck changes...</p>}
      {status === "error" && error && <p className="text-xs text-incorrect-red font-medium mb-2">Could not sync changes. Please try again.</p>}

      {filteredDecks.length === 0 && searchQuery.trim() && (
        <p className="text-sm text-text-muted italic">No decks match "{searchQuery}"</p>
      )}

      <div className="flex flex-col gap-3">
        {filteredDecks.map((deck) => {
          const isActive = deck.id === selectedDeckId;
          const progress = calculateDeckProgress(deck);

          return (
            <button
              key={deck.id}
              className={`p-4 rounded-xl text-left cursor-pointer transition-all ${
                isActive
                  ? 'bg-primary/15 border-2 border-primary shadow-paper transform scale-[1.02]'
                  : 'bg-card-background border-2 border-border-color/30 hover:shadow-md hover:border-primary/40 hover:bg-primary/5'
              } disabled:opacity-50`}
              onClick={() => selectDeck(deck.id)}
              disabled={busy && !isActive}
            >
              <p className="text-base font-bold m-0 text-text-color">{deck.title}</p>
              <p className="text-xs text-text-muted mt-1.5">
                {deck.cardCount} cards
                {progress.studiedCards > 0 && ` · ${progress.studiedCards} studied`}
                {progress.dueCards > 0 && (
                  <span className="text-primary font-semibold"> · {progress.dueCards} due</span>
                )}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {formatRelativeTime(deck.updatedAt)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
