import { useDeckStore } from "../store/deckStore";

function requestDeckCreation() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event("flash-ai:create-deck"));
}

export function DeckList() {
  const { decks, selectedDeckId, selectDeck, status, error } = useDeckStore((state) => ({
    decks: state.decks,
    selectedDeckId: state.selectedDeckId,
    selectDeck: state.selectDeck,
    status: state.status,
    error: state.error
  }));

  const busy = status === "loading";

  const handleCreate = () => {
    if (busy) {
      return;
    }
    selectDeck(null);
    requestDeckCreation();
  };

  if (status === "loading" && decks.length === 0) {
    return <p className="text-sm text-text-muted italic">Loading decks...</p>;
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
      {busy && <p className="text-xs text-primary font-medium mb-2">Syncing deck changes...</p>}
      {status === "error" && error && <p className="text-xs text-incorrect-red font-medium mb-2">Error: {error}</p>}
      <div className="flex flex-col gap-3">
        {decks.map((deck) => {
          const isActive = deck.id === selectedDeckId;

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
                {deck.cardCount} cards · {new Date(deck.updatedAt).toLocaleDateString()}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
