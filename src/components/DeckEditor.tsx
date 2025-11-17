import { FormEvent, useEffect, useMemo, useState } from "react";

import type { CardPayload } from "../types/deck";
import { usePlainTextPaste } from "../hooks/usePlainTextPaste";

interface DeckDraftCard {
  tempId: string;
  id?: string;
  prompt: string;
  answer: string;
  keypointsText: string;
}

interface DeckDraft {
  id?: string;
  title: string;
  description: string;
  cards: DeckDraftCard[];
}

interface DeckEditorProps {
  mode: "create" | "edit";
  initialDeck?: {
    id?: string;
    title: string;
    description?: string;
    cards: Array<{
      id?: string;
      prompt: string;
      answer?: string;
      keypoints?: string[];
    }>;
  } | null;
  submitting?: boolean;
  onSubmit: (payload: {
    title: string;
    description?: string;
    cards: CardPayload[];
  }) => Promise<boolean> | boolean;
  onCancel: () => void;
}

function makeTempId(seed?: string): string {
  if (seed) {
    return seed;
  }
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "temp-" + Math.random().toString(36).slice(2, 11);
}

function toDraft(initialDeck?: DeckEditorProps["initialDeck"]): DeckDraft {
  if (!initialDeck) {
    return {
      id: undefined,
      title: "",
      description: "",
      cards: [
        {
          tempId: makeTempId(),
          prompt: "",
          answer: "",
          keypointsText: ""
        }
      ]
    };
  }

  const cards: DeckDraftCard[] = initialDeck.cards.length
    ? initialDeck.cards.map((card, index) => ({
        tempId: makeTempId(card.id ?? "card-" + (index + 1)),
        id: card.id,
        prompt: card.prompt,
        answer: card.answer ?? "",
        keypointsText: (card.keypoints ?? []).join("\n")
      }))
    : [
        {
          tempId: makeTempId(),
          prompt: "",
          answer: "",
          keypointsText: ""
        }
      ];

  return {
    id: initialDeck.id,
    title: initialDeck.title,
    description: initialDeck.description ?? "",
    cards
  };
}

function sanitizeCards(cards: DeckDraftCard[]): CardPayload[] {
  return cards
    .map((card) => {
      const prompt = card.prompt.trim();
      const answer = card.answer.trim();
      const keypoints = card.keypointsText
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean);

      return {
        id: card.id,
        prompt,
        answer,
        keypoints
      };
    })
    .filter((card) => card.prompt && card.answer);
}

function validateCard(card: DeckDraftCard): { prompt?: string; answer?: string; keypoints?: string } {
  const errors: { prompt?: string; answer?: string; keypoints?: string } = {};

  if (!card.prompt.trim()) {
    errors.prompt = "Prompt is required";
  } else if (card.prompt.trim().length < 3) {
    errors.prompt = "Prompt must be at least 3 characters";
  }

  if (!card.answer.trim()) {
    errors.answer = "Answer is required";
  } else if (card.answer.trim().length < 3) {
    errors.answer = "Answer must be at least 3 characters";
  }

  const keypointLines = card.keypointsText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (keypointLines.length < 2) {
    errors.keypoints = "At least 2 keypoints required";
  } else if (keypointLines.length > 6) {
    errors.keypoints = "Maximum 6 keypoints allowed";
  }

  return errors;
}

export function DeckEditor({ mode, initialDeck, submitting, onSubmit, onCancel }: DeckEditorProps) {
  const [draft, setDraft] = useState<DeckDraft>(() => toDraft(initialDeck));
  const [error, setError] = useState<string | null>(null);
  const [cardValidations, setCardValidations] = useState<Record<string, ReturnType<typeof validateCard>>>({});
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const handlePlainTextPaste = usePlainTextPaste();

  useEffect(() => {
    setDraft(toDraft(initialDeck));
    setError(null);
    setCardValidations({});
    setSelectedCards(new Set());
  }, [initialDeck, mode]);

  // Real-time validation
  useEffect(() => {
    const validations: Record<string, ReturnType<typeof validateCard>> = {};
    draft.cards.forEach((card) => {
      validations[card.tempId] = validateCard(card);
    });
    setCardValidations(validations);
  }, [draft.cards]);

  const heading = useMemo(() => (mode === "create" ? "Create new deck" : "Edit deck"), [mode]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const title = draft.title.trim();
    if (!title) {
      setError("Deck title is required.");
      return;
    }

    const preparedCards = sanitizeCards(draft.cards);
    if (preparedCards.length === 0) {
      setError("Add at least one card with a prompt and answer.");
      return;
    }

    // Validate keypoints count (2-6 per card)
    for (let i = 0; i < preparedCards.length; i++) {
      const card = preparedCards[i];
      const keypointCount = card.keypoints.length;
      if (keypointCount < 2) {
        setError(`Card #${i + 1} must have at least 2 keypoints.`);
        return;
      }
      if (keypointCount > 6) {
        setError(`Card #${i + 1} has more than 6 keypoints.`);
        return;
      }
    }

    setError(null);
    try {
      const success = await onSubmit({
        title,
        description: draft.description.trim() || undefined,
        cards: preparedCards
      });
      if (!success) {
        setError("Unable to save the deck. Check the sidecar status for details.");
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : String(submissionError));
    }
  };

  const updateCard = (tempId: string, updater: (card: DeckDraftCard) => DeckDraftCard) => {
    setDraft((current) => ({
      ...current,
      cards: current.cards.map((card) => (card.tempId === tempId ? updater(card) : card))
    }));
  };

  const removeCard = (tempId: string) => {
    setDraft((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.tempId !== tempId)
    }));
  };

  const addCard = () => {
    setDraft((current) => ({
      ...current,
      cards: [
        ...current.cards,
        {
          tempId: makeTempId(),
          prompt: "",
          answer: "",
          keypointsText: ""
        }
      ]
    }));
  };

  const moveCardUp = (index: number) => {
    if (index === 0) return;
    setDraft((current) => {
      const newCards = [...current.cards];
      [newCards[index - 1], newCards[index]] = [newCards[index], newCards[index - 1]];
      return { ...current, cards: newCards };
    });
  };

  const moveCardDown = (index: number) => {
    setDraft((current) => {
      if (index === current.cards.length - 1) return current;
      const newCards = [...current.cards];
      [newCards[index], newCards[index + 1]] = [newCards[index + 1], newCards[index]];
      return { ...current, cards: newCards };
    });
  };

  const toggleCardSelection = (tempId: string) => {
    setSelectedCards((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) {
        next.delete(tempId);
      } else {
        next.add(tempId);
      }
      return next;
    });
  };

  const selectAllCards = () => {
    setSelectedCards(new Set(draft.cards.map((c) => c.tempId)));
  };

  const clearSelection = () => {
    setSelectedCards(new Set());
  };

  const bulkDeleteSelected = () => {
    if (selectedCards.size === 0) return;
    setDraft((current) => ({
      ...current,
      cards: current.cards.filter((card) => !selectedCards.has(card.tempId))
    }));
    setSelectedCards(new Set());
  };

  return (
    <form className="flex flex-col gap-6 p-6" onSubmit={handleSubmit}>
      <div>
        <h2 className="text-3xl font-bold m-0 mb-3 text-text-color font-display">{heading}</h2>
        <p className="text-sm text-text-muted">
          {mode === "create"
            ? "Provide deck details and at least one card."
            : "Update deck metadata or cards, then save your changes."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-base font-semibold text-text-color" htmlFor="deck-title">
          Deck title
        </label>
        <input
          id="deck-title"
          className={`hand-drawn-input text-text-color focus:outline-none text-base ${!draft.title.trim() ? 'border-2 border-warning-amber' : ''}`}
          value={draft.title}
          disabled={Boolean(submitting)}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              title: event.target.value
            }))
          }
          placeholder="e.g. Neuroanatomy Foundations"
          maxLength={200}
        />
        {!draft.title.trim() ? (
          <p className="text-xs text-warning-amber m-0">Deck title is required</p>
        ) : (
          <p className="text-xs text-text-muted m-0">{draft.title.length}/200 characters</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-base font-semibold text-text-color" htmlFor="deck-description">
          Description
        </label>
        <textarea
          id="deck-description"
          className="hand-drawn-input text-text-color focus:outline-none text-base min-h-[4.5rem] resize-y"
          value={draft.description}
          disabled={Boolean(submitting)}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              description: event.target.value
            }))
          }
          onPaste={handlePlainTextPaste}
          placeholder="Optional notes about this deck"
          maxLength={1000}
        />
        <p className="text-xs text-text-muted m-0">{draft.description.length}/1000 characters</p>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold m-0 text-text-color font-display">Cards ({draft.cards.length})</h3>
            {draft.cards.length > 1 && (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded-full border border-border-color bg-card-background text-text-color font-semibold hover:bg-paper-line"
                onClick={selectedCards.size === draft.cards.length ? clearSelection : selectAllCards}
                disabled={Boolean(submitting)}
              >
                {selectedCards.size === draft.cards.length ? "Deselect All" : "Select All"}
              </button>
            )}
          </div>
          <button
            type="button"
            className="px-6 py-2.5 rounded-full bg-primary text-white font-bold hand-drawn-btn"
            onClick={addCard}
            disabled={Boolean(submitting)}
          >
            Add card
          </button>
        </div>
        {selectedCards.size > 0 && (
          <div className="mb-4 p-4 rounded-xl bg-primary/10 border-2 border-primary/40 flex justify-between items-center">
            <p className="text-sm font-semibold text-text-color m-0">
              {selectedCards.size} card{selectedCards.size !== 1 ? 's' : ''} selected
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-full bg-incorrect-red text-white font-bold hand-drawn-btn hover:bg-incorrect-red/90 text-sm"
                onClick={bulkDeleteSelected}
                disabled={Boolean(submitting) || draft.cards.length - selectedCards.size < 1}
                title={draft.cards.length - selectedCards.size < 1 ? "Cannot delete all cards" : "Delete selected cards"}
              >
                Delete Selected
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-full border-2 border-border-color bg-card-background text-text-color font-semibold hand-drawn-btn hover:bg-paper-line text-sm"
                onClick={clearSelection}
                disabled={Boolean(submitting)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-4">
          {draft.cards.map((card, index) => {
            const validation = cardValidations[card.tempId] || {};
            const hasErrors = Object.keys(validation).length > 0;

            return (
              <div key={card.tempId} className={`p-6 rounded-xl flashcard paper-texture ${hasErrors ? 'border-2 border-warning-amber/50' : ''} ${selectedCards.has(card.tempId) ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    {draft.cards.length > 1 && (
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-2 border-border-color cursor-pointer"
                        checked={selectedCards.has(card.tempId)}
                        onChange={() => toggleCardSelection(card.tempId)}
                        disabled={Boolean(submitting)}
                      />
                    )}
                    <p className="text-lg font-bold m-0 text-text-color font-display">
                      Card {index + 1}
                      {hasErrors && <span className="ml-2 text-warning-amber text-sm">⚠</span>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {draft.cards.length > 1 && (
                      <>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-full border-2 border-border-color bg-card-background text-text-color font-bold hand-drawn-btn hover:bg-paper-line disabled:opacity-30 disabled:cursor-not-allowed"
                          onClick={() => moveCardUp(index)}
                          disabled={Boolean(submitting) || index === 0}
                          title="Move card up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-full border-2 border-border-color bg-card-background text-text-color font-bold hand-drawn-btn hover:bg-paper-line disabled:opacity-30 disabled:cursor-not-allowed"
                          onClick={() => moveCardDown(index)}
                          disabled={Boolean(submitting) || index === draft.cards.length - 1}
                          title="Move card down"
                        >
                          ↓
                        </button>
                      </>
                    )}
                    {draft.cards.length > 1 && (
                      <button
                        type="button"
                        className="px-4 py-2 rounded-full bg-incorrect-red text-white font-bold hand-drawn-btn hover:bg-incorrect-red/90"
                        onClick={() => removeCard(card.tempId)}
                        disabled={Boolean(submitting)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2 mb-4">
                  <label className="text-base font-semibold text-text-color" htmlFor={"prompt-" + card.tempId}>
                    Prompt {card.prompt.trim().length > 0 && <span className="text-xs text-text-muted font-normal">({card.prompt.trim().length} chars)</span>}
                  </label>
                  <textarea
                    id={"prompt-" + card.tempId}
                    className={`hand-drawn-input text-text-color focus:outline-none text-base min-h-[4.5rem] resize-y ${validation.prompt ? 'border-2 border-warning-amber' : ''}`}
                    value={card.prompt}
                    disabled={Boolean(submitting)}
                    onChange={(event) =>
                      updateCard(card.tempId, (current) => ({
                        ...current,
                        prompt: event.target.value
                      }))
                    }
                    onPaste={handlePlainTextPaste}
                    placeholder="What is the main idea of photosynthesis?"
                    maxLength={500}
                  />
                  {validation.prompt && <p className="text-xs text-warning-amber m-0">{validation.prompt}</p>}
                  {card.prompt.trim().length > 400 && (
                    <p className="text-xs text-text-muted m-0">{card.prompt.length}/500 characters</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 mb-4">
                  <label className="text-base font-semibold text-text-color" htmlFor={"answer-" + card.tempId}>
                    Answer {card.answer.trim().length > 0 && <span className="text-xs text-text-muted font-normal">({card.answer.trim().length} chars)</span>}
                  </label>
                  <textarea
                    id={"answer-" + card.tempId}
                    className={`hand-drawn-input text-text-color focus:outline-none text-base min-h-[4.5rem] resize-y ${validation.answer ? 'border-2 border-warning-amber' : ''}`}
                    value={card.answer}
                    disabled={Boolean(submitting)}
                    onChange={(event) =>
                      updateCard(card.tempId, (current) => ({
                        ...current,
                        answer: event.target.value
                      }))
                    }
                    onPaste={handlePlainTextPaste}
                    placeholder="A light-driven process that converts carbon dioxide and water into glucose and oxygen."
                    maxLength={2000}
                  />
                  {validation.answer && <p className="text-xs text-warning-amber m-0">{validation.answer}</p>}
                  {card.answer.trim().length > 1800 && (
                    <p className="text-xs text-text-muted m-0">{card.answer.length}/2000 characters</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-base font-semibold text-text-color" htmlFor={"keypoints-" + card.tempId}>
                    Keypoints (one per line) {card.keypointsText.split(/\r?\n/).filter(l => l.trim()).length > 0 && (
                      <span className="text-xs text-text-muted font-normal">
                        ({card.keypointsText.split(/\r?\n/).filter(l => l.trim()).length} keypoints)
                      </span>
                    )}
                  </label>
                  <textarea
                    id={"keypoints-" + card.tempId}
                    className={`hand-drawn-input text-text-color focus:outline-none text-base min-h-[4.5rem] resize-y ${validation.keypoints ? 'border-2 border-warning-amber' : ''}`}
                    value={card.keypointsText}
                    disabled={Boolean(submitting)}
                    onChange={(event) =>
                      updateCard(card.tempId, (current) => ({
                        ...current,
                        keypointsText: event.target.value
                      }))
                    }
                    onPaste={handlePlainTextPaste}
                    placeholder={"chloroplasts\nlight-dependent reactions\nATP generation"}
                    maxLength={600}
                  />
                  {validation.keypoints ? (
                    <p className="text-xs text-warning-amber m-0">{validation.keypoints}</p>
                  ) : (
                    <p className="text-sm text-text-muted mt-1">Keypoints help power the scoring rubric (2-6 required per card).</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="text-sm text-incorrect-red font-semibold">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          className="px-8 py-3 rounded-full bg-primary text-white font-bold hand-drawn-btn"
          disabled={Boolean(submitting)}
        >
          {submitting ? "Saving..." : mode === "create" ? "Create deck" : "Save changes"}
        </button>
        <button
          type="button"
          className="px-8 py-3 rounded-full bg-card-background text-text-color font-bold hand-drawn-btn border-2 border-border-color"
          onClick={onCancel}
          disabled={Boolean(submitting)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
