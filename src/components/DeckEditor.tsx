import { FormEvent, useEffect, useMemo, useState } from "react";

import type { CardPayload, GradingMode } from "../types/deck";

interface DeckDraftCard {
  tempId: string;
  id?: string;
  prompt: string;
  answer: string;
  keypointsText: string;
  gradingMode: GradingMode;
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
      gradingMode?: GradingMode;
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

const DEFAULT_GRADING_MODE: GradingMode = "lenient";

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
          keypointsText: "",
          gradingMode: DEFAULT_GRADING_MODE
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
        keypointsText: (card.keypoints ?? []).join("\n"),
        gradingMode: card.gradingMode ?? DEFAULT_GRADING_MODE
      }))
    : [
        {
          tempId: makeTempId(),
          prompt: "",
          answer: "",
          keypointsText: "",
          gradingMode: DEFAULT_GRADING_MODE
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
        keypoints,
        gradingMode: card.gradingMode ?? DEFAULT_GRADING_MODE
      };
    })
    .filter((card) => card.prompt && card.answer);
}

export function DeckEditor({ mode, initialDeck, submitting, onSubmit, onCancel }: DeckEditorProps) {
  const [draft, setDraft] = useState<DeckDraft>(() => toDraft(initialDeck));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toDraft(initialDeck));
    setError(null);
  }, [initialDeck, mode]);

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
          keypointsText: "",
          gradingMode: DEFAULT_GRADING_MODE
        }
      ]
    }));
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
          className="hand-drawn-input text-text-color focus:outline-none text-base"
          value={draft.title}
          disabled={Boolean(submitting)}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              title: event.target.value
            }))
          }
          placeholder="e.g. Neuroanatomy Foundations"
        />
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
          placeholder="Optional notes about this deck"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold m-0 text-text-color font-display">Cards ({draft.cards.length})</h3>
          <button
            type="button"
            className="px-6 py-2.5 rounded-full bg-primary text-white font-bold hand-drawn-btn"
            onClick={addCard}
            disabled={Boolean(submitting)}
          >
            Add card
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {draft.cards.map((card, index) => {
            return (
              <div key={card.tempId} className="p-6 rounded-xl flashcard paper-texture">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-lg font-bold m-0 text-text-color font-display">Card {index + 1}</p>
                  {draft.cards.length > 1 && (
                    <button
                      type="button"
                      className="px-4 py-2 rounded-full bg-incorrect-red text-white font-bold hand-drawn-btn"
                      onClick={() => removeCard(card.tempId)}
                      disabled={Boolean(submitting)}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2 mb-4">
                  <label className="text-base font-semibold text-text-color" htmlFor={"prompt-" + card.tempId}>
                    Prompt
                  </label>
                  <textarea
                    id={"prompt-" + card.tempId}
                    className="hand-drawn-input text-text-color focus:outline-none text-base min-h-[4.5rem] resize-y"
                    value={card.prompt}
                    disabled={Boolean(submitting)}
                    onChange={(event) =>
                      updateCard(card.tempId, (current) => ({
                        ...current,
                        prompt: event.target.value
                      }))
                    }
                    placeholder="What is the main idea of photosynthesis?"
                  />
                </div>
                <div className="flex flex-col gap-2 mb-4">
                  <label className="text-base font-semibold text-text-color" htmlFor={"answer-" + card.tempId}>
                    Answer
                  </label>
                  <textarea
                    id={"answer-" + card.tempId}
                    className="hand-drawn-input text-text-color focus:outline-none text-base min-h-[4.5rem] resize-y"
                    value={card.answer}
                    disabled={Boolean(submitting)}
                    onChange={(event) =>
                      updateCard(card.tempId, (current) => ({
                        ...current,
                        answer: event.target.value
                      }))
                    }
                    placeholder="A light-driven process that converts carbon dioxide and water into glucose and oxygen."
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-base font-semibold text-text-color" htmlFor={"keypoints-" + card.tempId}>
                    Keypoints (one per line)
                  </label>
                  <textarea
                    id={"keypoints-" + card.tempId}
                    className="hand-drawn-input text-text-color focus:outline-none text-base min-h-[4.5rem] resize-y"
                    value={card.keypointsText}
                    disabled={Boolean(submitting)}
                    onChange={(event) =>
                      updateCard(card.tempId, (current) => ({
                        ...current,
                        keypointsText: event.target.value
                      }))
                    }
                    placeholder={"chloroplasts\nlight-dependent reactions\nATP generation"}
                  />
                  <p className="text-sm text-text-muted mt-1">Keypoints help power the scoring rubric (2-6 required per card).</p>
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
