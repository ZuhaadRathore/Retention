import { useEffect, useMemo, useState } from "react";

import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

import { DeckEditor } from "./DeckEditor";
import { StudyPanel } from "./StudyPanel";
import { DeckHomeScreen } from "./DeckHomeScreen";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { useToast, ToastContainer } from "./Toast";
import { useDeckStore } from "../store/deckStore";
import { useStudyStore } from "../store/studyStore";
import { normalizeFilename, createDeckExportPayload } from "../utils/deckImportExport";
import type { CardPayload, Deck } from "../types/deck";

type EditorPayload = {
  title: string;
  description?: string;
  cards: CardPayload[];
};

function parseDeckImport(content: string): EditorPayload {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  const candidate =
    typeof data === "object" &&
    data !== null &&
    "deck" in (data as Record<string, unknown>)
      ? (data as Record<string, unknown>).deck
      : data;

  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("Deck file is missing the expected deck payload.");
  }

  const record = candidate as Record<string, unknown>;
  const title = record.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("Deck title is required.");
  }

  const description =
    typeof record.description === "string" ? record.description.trim() : undefined;
  const rawCards = record.cards;
  if (!Array.isArray(rawCards) || rawCards.length === 0) {
    throw new Error("Deck must include at least one card.");
  }

  const cards: CardPayload[] = rawCards.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Card #${index + 1} must be an object.`);
    }
    const entry = item as Record<string, unknown>;
    const prompt = entry.prompt;
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      throw new Error(`Card #${index + 1} is missing a prompt.`);
    }
    const answer = entry.answer;
    if (typeof answer !== "string" || answer.trim().length === 0) {
      throw new Error(`Card #${index + 1} is missing an answer.`);
    }
    const keypointsValue = entry.keypoints;
    let keypointItems: string[] = [];
    if (Array.isArray(keypointsValue)) {
      keypointItems = keypointsValue
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0);
    } else if (typeof keypointsValue === "string") {
      keypointItems = keypointsValue
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }
    if (keypointItems.length < 2) {
      throw new Error(`Card #${index + 1} must have at least 2 keypoints.`);
    }
    if (keypointItems.length > 6) {
      throw new Error(`Card #${index + 1} has more than 6 keypoints.`);
    }

    // Parse alternative answers if present
    let alternativeAnswers: string[] = [];
    const alternativeAnswersValue = entry.alternativeAnswers;
    if (Array.isArray(alternativeAnswersValue)) {
      alternativeAnswers = alternativeAnswersValue
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0);
    }

    return {
      id: typeof entry.id === "string" ? entry.id : undefined,
      prompt: prompt.trim(),
      answer: answer.trim(),
      keypoints: keypointItems,
      alternativeAnswers: alternativeAnswers.length > 0 ? alternativeAnswers : undefined
    };
  });

  return {
    title: title.trim(),
    description: description && description.length > 0 ? description : undefined,
    cards
  };
}


function formatDate(date: string): string {
  return new Date(date).toLocaleString();
}

export function DeckDetails() {
  const {
    decks,
    selectedDeckId,
    status,
    error,
    addDeck,
    updateDeck,
    removeDeck,
    bulkUpdateCards
  } = useDeckStore((state) => ({
    decks: state.decks,
    selectedDeckId: state.selectedDeckId,
    status: state.status,
    error: state.error,
    addDeck: state.addDeck,
    updateDeck: state.updateDeck,
    removeDeck: state.removeDeck,
    bulkUpdateCards: state.bulkUpdateCards
  }));
  const selectStudyCard = useStudyStore((state) => state.selectCard);
  const activeCardId = useStudyStore((state) => state.activeCardId);
  const startSession = useStudyStore((state) => state.startSession);
  const resetSession = useStudyStore((state) => state.resetSession);
  const sessionDeckId = useStudyStore((state) => state.session.deckId);
  const sessionTotal = useStudyStore((state) => state.session.total);
  const sessionActive = useStudyStore((state) => state.session.active);

  const deck = useMemo(
    () => decks.find((item) => item.id === selectedDeckId) ?? null,
    [decks, selectedDeckId]
  );
  const activeCard = useMemo(() => {
    if (sessionActive) {
      return sessionActive;
    }
    if (!deck || !activeCardId) {
      return null;
    }
    return deck.cards.find((card) => card.id === activeCardId) ?? null;
  }, [sessionActive, deck, activeCardId]);
  const [mode, setMode] = useState<"view" | "create" | "edit">("view");
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showHomeScreen, setShowHomeScreen] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { toasts, showToast, closeToast } = useToast();

  useEffect(() => {
    setMode((current) => (current === "create" ? current : "view"));
    setShowHomeScreen(true); // Reset to home screen when deck changes
    resetSession(); // Clear any active session when switching decks
  }, [selectedDeckId, resetSession]);

  useEffect(() => {
    // Only auto-start session if we're already in study mode (not on home screen)
    // This handles cases where cards are added/removed during an active session
    if (deck && !showHomeScreen) {
      if (sessionDeckId !== deck.id || sessionTotal !== deck.cards.length) {
        startSession(deck.id, deck.cards);
      }
    } else if (sessionDeckId && !deck) {
      // Reset session if deck is deleted
      resetSession();
    }
  }, [
    deck?.id,
    deck?.cards.length,
    sessionDeckId,
    sessionTotal,
    showHomeScreen,
    startSession,
    resetSession
  ]);

  useEffect(() => {
    if (mode === "edit" && !deck) {
      setMode("view");
    }
  }, [mode, deck]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleCreateRequest = () => setMode("create");
    window.addEventListener("retention:create-deck", handleCreateRequest);
    return () => {
      window.removeEventListener("retention:create-deck", handleCreateRequest);
    };
  }, []);

  useEffect(() => {
    setLocalMessage(null);
    setLocalError(null);
  }, [selectedDeckId]);

  const busy = status === "loading";
  const statusMessage = localMessage ?? (busy && decks.length > 0 ? "Syncing deck changes..." : null);
  const errorMessage =
    localError ?? (status === "error" ? error ?? "Unable to update deck." : null);

  const handleCreateSubmit = async (payload: EditorPayload) => {
    setLocalMessage(null);
    setLocalError(null);
    const success = await addDeck(payload);
    if (success) {
      setMode("view");
      showToast(`Created deck "${payload.title}"`, "success");
    } else {
      showToast("Failed to create deck. Please try again.", "error");
    }
    return success;
  };

  const handleEditSubmit = async (payload: EditorPayload) => {
    if (!deck) {
      return false;
    }
    setLocalMessage(null);
    setLocalError(null);
    const success = await updateDeck(deck.id, payload);
    if (success) {
      setMode("view");
      showToast(`Updated deck "${payload.title}"`, "success");
    } else {
      showToast("Failed to update deck. Please try again.", "error");
    }
    return success;
  };

  const handleImportDeck = async () => {
    if (busy) {
      return;
    }
    setLocalMessage(null);
    setLocalError(null);
    try {
      const selection = await open({
        multiple: false,
        filters: [{ name: "Deck JSON", extensions: ["json"] }]
      });
      const path =
        typeof selection === "string"
          ? selection
          : Array.isArray(selection)
          ? selection[0]
          : null;
      if (!path) {
        return;
      }
      const raw = await readTextFile(path);
      const payload = parseDeckImport(raw);
      const success = await addDeck(payload);
      if (success) {
        setMode("view");
        showToast(`Imported deck "${payload.title}"`, "success");
      } else {
        showToast("Failed to import deck. Please try again.", "error");
      }
    } catch (importError) {
      const errorMsg = importError instanceof Error ? importError.message : String(importError);
      showToast(errorMsg, "error");
    }
  };

  const handleExportDeck = async () => {
    if (!deck) {
      return;
    }
    setLocalMessage(null);
    setLocalError(null);
    try {
      const suggested = normalizeFilename(deck.title);
      const target = await save({
        defaultPath: suggested,
        filters: [{ name: "Deck JSON", extensions: ["json"] }]
      });
      if (!target) {
        return;
      }
      const payload = createDeckExportPayload(deck);
      await writeTextFile(target, payload);
      showToast(`Exported deck "${deck.title}"`, "success");
    } catch (exportError) {
      const errorMsg = exportError instanceof Error ? exportError.message : String(exportError);
      showToast(errorMsg, "error");
    }
  };

  const handleDelete = () => {
    if (!deck || busy) {
      return;
    }
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deck) {
      return;
    }
    setShowDeleteModal(false);
    setLocalMessage(null);
    setLocalError(null);
    const deckTitle = deck.title;
    const success = await removeDeck(deck.id);
    if (success) {
      setMode("view");
      showToast(`Deleted deck "${deckTitle}"`, "success");
    } else {
      showToast("Failed to delete deck. Please try again.", "error");
    }
  };

  const handleStartStudying = () => {
    if (!deck) return;
    setShowHomeScreen(false);
    // Start the study session
    startSession(deck.id, deck.cards);
  };

  const handleReturnHome = () => {
    setShowHomeScreen(true);
    resetSession();
  };

  if (mode === "create") {
    return (
      <>
        <ToastContainer toasts={toasts} onClose={closeToast} />
        <div className="p-8 flashcard paper-texture min-h-[20rem]">
          <DeckEditor
            mode="create"
            initialDeck={null}
            submitting={busy}
            onSubmit={handleCreateSubmit}
            onCancel={() => setMode("view")}
          />
          {statusMessage && <p className="mt-4 p-4 rounded-xl bg-accent-tan/30 border-2 border-border-color text-text-color text-sm hand-drawn">{statusMessage}</p>}
          {errorMessage && <p className="mt-4 p-4 rounded-xl bg-incorrect-red/20 border-2 border-incorrect-red text-text-color text-sm hand-drawn">{errorMessage}</p>}
        </div>
      </>
    );
  }

  if (mode === "edit" && deck) {
    return (
      <>
        <ToastContainer toasts={toasts} onClose={closeToast} />
        <div className="p-8 flashcard paper-texture min-h-[20rem]">
          <DeckEditor
            mode="edit"
            initialDeck={deck}
            submitting={busy}
            onSubmit={handleEditSubmit}
            onCancel={() => setMode("view")}
          />
          {statusMessage && <p className="mt-4 p-4 rounded-xl bg-accent-tan/30 border-2 border-border-color text-text-color text-sm hand-drawn">{statusMessage}</p>}
          {errorMessage && <p className="mt-4 p-4 rounded-xl bg-incorrect-red/20 border-2 border-incorrect-red text-text-color text-sm hand-drawn">{errorMessage}</p>}
        </div>
      </>
    );
  }

  if (status === "loading" && !deck) {
    return (
      <div className="p-8 flashcard paper-texture min-h-[20rem]">
        {/* Loading Skeleton */}
        <div className="animate-pulse">
          <div className="h-8 bg-border-color/30 rounded-lg w-3/4 mb-4"></div>
          <div className="h-4 bg-border-color/20 rounded-lg w-1/2 mb-6"></div>
          <div className="space-y-3">
            <div className="h-32 bg-border-color/20 rounded-xl"></div>
            <div className="h-32 bg-border-color/20 rounded-xl"></div>
            <div className="h-32 bg-border-color/20 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error" && !deck) {
    return (
      <div className="p-8 flashcard paper-texture min-h-[20rem]">
        <h2 className="text-2xl font-bold m-0 mb-3 text-text-color font-display">Unable to load decks</h2>
        <p className="text-base text-text-muted mb-6">
          {errorMessage ?? error ?? "Try checking the sidecar status."}
        </p>
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            className="px-5 py-2 rounded-full bg-primary text-white font-bold hand-drawn-btn hover:bg-primary-dark disabled:opacity-50 shadow-md"
            onClick={() => setMode("create")}
            disabled={busy}
          >
            New deck
          </button>
          <button
            type="button"
            className="px-5 py-2 rounded-full border-2 border-border-color bg-card-background text-text-color font-bold hand-drawn-btn hover:bg-paper-line disabled:opacity-50"
            onClick={handleImportDeck}
            disabled={busy}
          >
            Import deck
          </button>
        </div>
        {errorMessage && <p className="mt-4 p-4 rounded-xl bg-incorrect-red/20 border-2 border-incorrect-red text-text-color text-sm hand-drawn">{errorMessage}</p>}
      </div>
    );
  }

  if (!deck) {
    // Distinguish between "no decks exist" vs "decks exist but none selected"
    const noDecksExist = decks.length === 0;

    return (
      <div className="p-8 flashcard paper-texture min-h-[20rem]">
        <h2 className="text-2xl font-bold m-0 mb-3 text-text-color font-display">
          {noDecksExist ? "No decks yet" : "Select a deck"}
        </h2>
        <p className="text-base text-text-muted mb-6">
          {noDecksExist
            ? "Create your first deck to get started with spaced repetition learning."
            : "Choose a deck from the left panel to review its cards and study metadata."}
        </p>
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            className="px-5 py-2 rounded-full bg-primary text-white font-bold hand-drawn-btn hover:bg-primary-dark disabled:opacity-50 shadow-md"
            onClick={() => setMode("create")}
            disabled={busy}
          >
            New deck
          </button>
          <button
            type="button"
            className="px-5 py-2 rounded-full border-2 border-border-color bg-card-background text-text-color font-bold hand-drawn-btn hover:bg-paper-line disabled:opacity-50"
            onClick={handleImportDeck}
            disabled={busy}
          >
            Import deck
          </button>
        </div>
      </div>
    );
  }

  // If there's an active card or we're in study mode, show the study panel
  if (activeCard || !showHomeScreen) {
    return (
      <>
        <ToastContainer toasts={toasts} onClose={closeToast} />
        <div className="flex flex-col gap-4">
          <StudyPanel
            card={activeCard}
            deckTitle={deck.title}
            mode={mode}
            onReturnHome={handleReturnHome}
          />
        </div>
      </>
    );
  }

  // Otherwise show the deck home screen
  return (
    <>
      <ToastContainer toasts={toasts} onClose={closeToast} />
      {showDeleteModal && deck && (
        <DeleteConfirmModal
          itemName={deck.title}
          itemType="deck"
          cardCount={deck.cardCount}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
      <DeckHomeScreen
        deck={deck}
        onStartStudying={handleStartStudying}
        onEdit={() => setMode("edit")}
        onExport={handleExportDeck}
        onDelete={handleDelete}
        busy={busy}
      />
      {statusMessage && <p className="mt-4 p-3 rounded-xl bg-blue-100 text-blue-800 text-sm mx-8">{statusMessage}</p>}
      {errorMessage && <p className="mt-4 p-3 rounded-xl bg-red-100 text-red-800 text-sm mx-8">{errorMessage}</p>}
    </>
  );
}
