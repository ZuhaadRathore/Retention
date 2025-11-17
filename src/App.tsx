import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/api/dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/api/fs";

import { DeckDetails } from "./components/DeckDetails";
import { DeckList } from "./components/DeckList";
import { DeleteConfirmModal } from "./components/DeleteConfirmModal";
import { useDeckStore } from "./store/deckStore";
import { useStudyStore } from "./store/studyStore";
import { useBackendStore } from "./store/backendStore";
import { useDarkMode } from "./hooks/useDarkMode";
import { useToast, ToastContainer } from "./components/Toast";
import type { CardPayload, CardSchedule, Deck } from "./types/deck";

// Helper functions for import/export (duplicated from DeckDetails for now)
function normalizeFilename(title: string): string {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (base.length > 0 ? base : "deck") + ".json";
}

function createDeckExportPayload(deck: Deck): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      deck: {
        id: deck.id,
        title: deck.title,
        description: deck.description ?? "",
        cards: deck.cards.map((card) => ({
          id: card.id,
          prompt: card.prompt,
          answer: card.answer ?? "",
          keypoints: card.keypoints ?? [],
          schedule: card.schedule ?? null,
          alternativeAnswers: card.alternativeAnswers ?? []
        }))
      }
    },
    null,
    2
  );
}

function parseDeckImport(content: string): { title: string; description?: string; cards: CardPayload[] } {
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

    // Parse schedule and alternative answers if present
    let schedule: CardSchedule | null = null;
    const scheduleValue = entry.schedule;
    if (scheduleValue !== null && typeof scheduleValue === "object") {
      const scheduleRecord = scheduleValue as Record<string, unknown>;
      const dueAt = scheduleRecord.dueAt;
      const interval = scheduleRecord.interval;
      const ease = scheduleRecord.ease;
      const streak = scheduleRecord.streak;

      if (
        typeof dueAt === "string" &&
        typeof interval === "number" &&
        typeof ease === "number" &&
        typeof streak === "number"
      ) {
        schedule = {
          dueAt,
          interval,
          ease,
          streak,
          quality:
            scheduleRecord.quality === null || scheduleRecord.quality === undefined
              ? null
              : typeof scheduleRecord.quality === "number"
              ? scheduleRecord.quality
              : null
        };
      }
    }

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
      schedule: schedule,
      alternativeAnswers: alternativeAnswers.length > 0 ? alternativeAnswers : undefined
    };
  });

  return {
    title: title.trim(),
    description: description && description.length > 0 ? description : undefined,
    cards
  };
}

function App() {
  const initializeDecks = useDeckStore((state) => state.initialize);
  const checkHealth = useBackendStore((state) => state.checkHealth);
  const resetSession = useStudyStore((state) => state.resetSession);
  const { isDark, toggle } = useDarkMode();
  const { toasts, showToast, closeToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const { decks, selectedDeckId, addDeck } = useDeckStore((state) => ({
    decks: state.decks,
    selectedDeckId: state.selectedDeckId,
    addDeck: state.addDeck
  }));

  const selectedDeck = decks.find((d) => d.id === selectedDeckId) ?? null;

  useEffect(() => {
    void initializeDecks();
  }, [initializeDecks]);

  useEffect(() => {
    void checkHealth();

    // Poll backend health every 30 seconds
    const interval = setInterval(() => {
      void checkHealth();
    }, 30000);

    return () => clearInterval(interval);
  }, [checkHealth]);

  const handleImportDeck = async () => {
    if (busy) return;
    setBusy(true);
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
        setBusy(false);
        return;
      }
      const raw = await readTextFile(path);
      const payload = parseDeckImport(raw);
      const success = await addDeck(payload);
      if (success) {
        showToast(`Imported deck "${payload.title}"`, "success");
      } else {
        showToast("Failed to import deck. Please try again.", "error");
      }
    } catch (importError) {
      const errorMsg = importError instanceof Error ? importError.message : String(importError);
      showToast(errorMsg, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleExportDeck = async () => {
    if (!selectedDeck || busy) return;
    setBusy(true);
    try {
      const suggested = normalizeFilename(selectedDeck.title);
      const target = await save({
        defaultPath: suggested,
        filters: [{ name: "Deck JSON", extensions: ["json"] }]
      });
      if (!target) {
        setBusy(false);
        return;
      }
      const payload = createDeckExportPayload(selectedDeck);
      await writeTextFile(target, payload);
      showToast(`Exported deck "${selectedDeck.title}"`, "success");
    } catch (exportError) {
      const errorMsg = exportError instanceof Error ? exportError.message : String(exportError);
      showToast(errorMsg, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleResetAppData = () => {
    // Clear study session
    resetSession();

    // Clear all localStorage
    localStorage.clear();

    // Show success message
    showToast("All app data has been cleared. Refresh to reload.", "success");

    // Close modal
    setShowResetModal(false);

    // Reload the page after a short delay
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  return (
    <>
      <ToastContainer toasts={toasts} onClose={closeToast} />
      {showResetModal && (
        <DeleteConfirmModal
          itemName="all app data"
          itemType="data"
          onConfirm={handleResetAppData}
          onCancel={() => setShowResetModal(false)}
        />
      )}
      <div className="relative flex min-h-screen bg-background-light paper-texture">
        <aside className="w-72 bg-card-background/60 p-6 flex flex-col justify-between border-r-4 border-border-color shadow-lg">
          <div>
            <div className="flex flex-col mb-10 p-3">
              <h1 className="text-primary text-5xl font-bold leading-tight font-display tracking-tight">Retention</h1>
              <p className="text-text-muted text-base font-medium mt-2">Learn it. Keep it. Make it stick.</p>
            </div>
            <div>
              <DeckList />
            </div>

            {/* Import/Export buttons */}
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                className="w-full px-4 py-2 rounded-lg border-2 border-border-color bg-card-background text-text-color font-semibold hand-drawn-btn hover:bg-paper-line disabled:opacity-50 text-sm transition-colors flex items-center justify-center gap-2"
                onClick={handleImportDeck}
                disabled={busy}
              >
                <span>📥</span>
                <span>Import Deck</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-2 rounded-lg border-2 border-border-color bg-card-background text-text-color font-semibold hand-drawn-btn hover:bg-paper-line disabled:opacity-50 text-sm transition-colors flex items-center justify-center gap-2"
                onClick={handleExportDeck}
                disabled={busy || !selectedDeck}
                title={!selectedDeck ? "Select a deck to export" : "Export selected deck"}
              >
                <span>📤</span>
                <span>Export Deck</span>
              </button>
            </div>
          </div>

          {/* Settings Section */}
          <div className="pt-4 border-t-2 border-border-color/30 space-y-3">
            {/* Dark Mode Toggle */}
            <button
              type="button"
              className="w-full px-4 py-3 rounded-xl border-2 border-border-color bg-card-background text-text-color font-semibold hand-drawn-btn hover:bg-paper-line flex items-center justify-between text-sm transition-colors"
              onClick={toggle}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              <span className="flex items-center gap-2">
                <span className="text-xl">{isDark ? "🌙" : "☀️"}</span>
                <span>{isDark ? "Dark Mode" : "Light Mode"}</span>
              </span>
              <span className="text-xs text-text-muted">Toggle</span>
            </button>

            {/* Reset App Data */}
            <button
              type="button"
              className="w-full px-4 py-3 rounded-xl border-2 border-incorrect-red/50 bg-card-background text-incorrect-red font-semibold hand-drawn-btn hover:bg-incorrect-red/10 flex items-center justify-center gap-2 text-sm transition-colors"
              onClick={() => setShowResetModal(true)}
              title="Clear all app data and reset to defaults"
            >
              <span className="text-xl">⚠️</span>
              <span>Reset App Data</span>
            </button>

            {/* Version Number */}
            <div className="text-center pt-2">
              <p className="text-xs text-text-muted m-0">
                Version <span className="font-mono font-semibold">0.1.0</span>
              </p>
            </div>
          </div>
        </aside>
        <main className="flex-1 flex flex-col p-10 bg-gradient-to-br from-background-light via-background-light to-paper-line">
          <DeckDetails />
        </main>
      </div>
    </>
  );
}

export default App;
