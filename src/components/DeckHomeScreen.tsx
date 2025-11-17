import type { Deck } from "../types/deck";
import { formatRelativeTime } from "../utils/time";
import { renderMarkdown } from "../utils/markdown";

interface DeckHomeScreenProps {
  deck: Deck;
  onStartStudying: () => void;
  onEdit: () => void;
  onExport: () => void;
  onDelete: () => void;
  busy?: boolean;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString();
}

function calculateDeckStats(deck: Deck) {
  const totalCards = deck.cards.length;
  const archivedCount = deck.cards.filter(card => card.archived).length;
  const now = new Date();

  // Find cards due for review
  const dueCards = deck.cards.filter((card) => {
    if (!card.schedule?.dueAt) return false;
    return new Date(card.schedule.dueAt) <= now;
  });

  // Find next due card
  const cardsWithSchedules = deck.cards
    .filter(card => card.schedule?.dueAt)
    .map(card => ({ card, dueAt: new Date(card.schedule!.dueAt) }))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  const nextDue = cardsWithSchedules.length > 0 ? cardsWithSchedules[0] : null;

  return {
    totalCards,
    archivedCount,
    dueCount: dueCards.length,
    nextDueAt: nextDue?.dueAt.toISOString(),
    studiedCount: deck.cards.filter(card => card.schedule).length
  };
}

export function DeckHomeScreen({ deck, onStartStudying, onEdit, onExport, onDelete, busy = false }: DeckHomeScreenProps) {
  const stats = calculateDeckStats(deck);

  return (
    <div className="p-8 flashcard paper-texture min-h-[20rem]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold m-0 mb-4 text-text-color font-display">{deck.title}</h1>
        {deck.description && (
          <div
            className="text-lg text-text-muted mb-4 leading-relaxed prose prose-sm max-w-none"
            dangerouslySetInnerHTML={renderMarkdown(deck.description)}
          />
        )}
        <p className="text-sm text-text-muted">
          Last updated: <strong>{formatDate(deck.updatedAt)}</strong>
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))] mb-8">
        <div className="border-2 border-border-color rounded-xl p-5 bg-card-background/60 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-4xl font-bold m-0 text-primary">{stats.totalCards}</p>
          <p className="mt-2 text-text-muted text-sm">Total Cards</p>
        </div>

        {stats.studiedCount > 0 && (
          <div className="border-2 border-correct-green/40 rounded-xl p-5 bg-correct-green/10 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-4xl font-bold m-0 text-correct-green">{stats.studiedCount}</p>
            <p className="mt-2 text-text-muted text-sm">Studied</p>
          </div>
        )}

        {stats.dueCount > 0 && (
          <div className="border-2 border-primary/40 rounded-xl p-5 bg-primary/10 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-4xl font-bold m-0 text-primary">{stats.dueCount}</p>
            <p className="mt-2 text-text-muted text-sm">Due for Review</p>
          </div>
        )}

        {stats.archivedCount > 0 && (
          <div className="border-2 border-border-color rounded-xl p-5 bg-card-background/60 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-4xl font-bold m-0 text-text-muted">{stats.archivedCount}</p>
            <p className="mt-2 text-text-muted text-sm">Archived</p>
          </div>
        )}
      </div>

      {/* Next Review Info */}
      {stats.nextDueAt && (
        <div className="mb-8 p-4 rounded-xl bg-primary/10 border-2 border-primary/30">
          <p className="text-sm font-semibold text-primary m-0">
            📅 Next review: {formatRelativeTime(stats.nextDueAt)}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mb-8">
        <h3 className="text-xl font-bold mb-4 text-text-color font-display">Quick Actions</h3>
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            className="px-8 py-4 rounded-full bg-primary text-white font-bold hand-drawn-btn hover:bg-primary-dark disabled:opacity-50 text-lg shadow-lg transform hover:scale-105 transition-transform"
            onClick={onStartStudying}
            disabled={busy || stats.totalCards === 0}
          >
            Start Studying
          </button>

          <button
            type="button"
            className="px-6 py-4 rounded-full border-2 border-border-color bg-card-background text-text-color font-semibold hand-drawn-btn hover:bg-paper-line disabled:opacity-50 text-base"
            onClick={onEdit}
            disabled={busy}
          >
            Edit Deck
          </button>

          <button
            type="button"
            className="px-6 py-4 rounded-full border-2 border-border-color bg-card-background text-text-color font-semibold hand-drawn-btn hover:bg-paper-line disabled:opacity-50 text-base"
            onClick={onExport}
            disabled={busy}
          >
            Export Deck
          </button>

          <button
            type="button"
            className="px-6 py-4 rounded-full bg-incorrect-red text-white font-bold hand-drawn-btn hover:bg-incorrect-red/90 disabled:opacity-50 text-base shadow-md"
            onClick={onDelete}
            disabled={busy}
          >
            Delete Deck
          </button>
        </div>
      </div>

      {/* Study Tips */}
      {stats.totalCards === 0 && (
        <div className="p-5 rounded-xl bg-primary/20 border-2 border-primary hand-drawn">
          <p className="text-base text-text-color m-0 font-semibold">
            This deck is empty.
          </p>
          <p className="text-sm text-text-muted mt-2">
            Click "Edit Deck" to add cards and start learning!
          </p>
        </div>
      )}
    </div>
  );
}
