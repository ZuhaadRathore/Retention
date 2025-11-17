import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDeckStore } from "../store/deckStore";
import { useStudyStore } from "../store/studyStore";
import { useBackendStore } from "../store/backendStore";
import type { CardSummary, CardPayload } from "../types/deck";
import type { AttemptRecord } from "../types/study";
import type { SessionQueueState } from "../store/sessionQueue";

interface StudyPanelProps {
  card: CardSummary | null;
  deckTitle: string;
  mode?: "view" | "create" | "edit";
  onReturnHome?: () => void;
}


const verdictPalette: Record<string, { label: string; color: string; bg: string; borderColor: string }> = {
  correct: { label: "Correct", color: "#3E5902", bg: "#E8F4D9", borderColor: "#6B8E23" },
  almost: { label: "Almost", color: "#8B4513", bg: "#FFEFD5", borderColor: "#CD853F" },
  missing: { label: "Missing keypoints", color: "#8B4513", bg: "#FFEFD5", borderColor: "#CD853F" },
  incorrect: { label: "Incorrect", color: "#721C24", bg: "#F8D7DA", borderColor: "#A0522D" }
};

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function AttemptHistory({ attempts }: { attempts: AttemptRecord[] }) {
  if (!attempts.length) {
    return <p className="text-text-muted text-sm italic">No prior attempts logged for this card.</p>;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="text-left border-b-2 border-border-color py-2 text-text-color font-semibold">When</th>
          <th className="text-left border-b-2 border-border-color py-2 text-text-color font-semibold">Verdict</th>
          <th className="text-left border-b-2 border-border-color py-2 text-text-color font-semibold">Score</th>
          <th className="text-left border-b-2 border-border-color py-2 text-text-color font-semibold">Cosine</th>
          <th className="text-left border-b-2 border-border-color py-2 text-text-color font-semibold">Coverage</th>
        </tr>
      </thead>
      <tbody>
        {attempts.map((attempt) => (
          <tr key={attempt.id}>
            <td className="py-2 border-b border-border-color/30 text-text-color">{formatTimestamp(attempt.createdAt)}</td>
            <td className="py-2 border-b border-border-color/30 text-text-color">
              <span>{verdictPalette[attempt.verdict]?.label ?? attempt.verdict}</span>
            </td>
            <td className="py-2 border-b border-border-color/30 text-text-color">{attempt.score.toFixed(2)}</td>
            <td className="py-2 border-b border-border-color/30 text-text-color">{attempt.cosine.toFixed(2)}</td>
            <td className="py-2 border-b border-border-color/30 text-text-color">{attempt.coverage.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatSessionAge(timestampMs: number): string {
  const ageMs = Date.now() - timestampMs;
  const minutes = Math.floor(ageMs / (60 * 1000));
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

interface SessionRestorationBannerProps {
  deckTitle: string;
  sessionStartedAt: number;
  progress: { completed: number; total: number };
  onClearSession: () => void;
}

function SessionRestorationBanner({
  deckTitle,
  sessionStartedAt,
  progress,
  onClearSession
}: SessionRestorationBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setDismissed(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  if (dismissed) {
    return null;
  }

  return (
    <div className="p-2 px-4 rounded-lg mb-3 bg-primary/10 border border-primary/30 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-primary font-semibold flex-shrink-0">Session Restored:</span>
        <span className="text-text-color truncate">
          Resumed <strong>{deckTitle}</strong> from {formatSessionAge(sessionStartedAt)} ({progress.completed}/{progress.total} cards)
        </span>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          type="button"
          className="px-3 py-1 rounded-md text-xs border border-border-color/50 bg-card-background text-text-muted hover:bg-paper-line hover:text-text-color transition-colors"
          onClick={() => setDismissed(true)}
          title="Dismiss notification"
        >
          Dismiss
        </button>
        <button
          type="button"
          className="px-3 py-1 rounded-md text-xs bg-incorrect-red/90 text-white hover:bg-incorrect-red transition-colors"
          onClick={onClearSession}
          title="Start a fresh session"
        >
          Clear Session
        </button>
      </div>
    </div>
  );
}

function BackendStatusBanner() {
  const status = useBackendStore((state) => state.status);
  const checkHealth = useBackendStore((state) => state.checkHealth);

  if (status === "healthy" || status === "unknown") {
    return null;
  }

  let bannerClass: string;
  let indicatorColor: string;
  let message: string;

  if (status === "unreachable" || status === "error") {
    bannerClass = "bg-incorrect-red/20 text-text-color border-2 border-incorrect-red";
    indicatorColor = "bg-incorrect-red";
    message = "Backend server is offline. Answers cannot be scored. Check the Backend Status section below.";
  } else if (status === "checking") {
    bannerClass = "bg-warning-amber/20 text-text-color border-2 border-warning-amber";
    indicatorColor = "bg-warning-amber";
    message = "Backend server is initializing. Please wait before submitting answers.";
  } else {
    bannerClass = "bg-primary/20 text-text-color border-2 border-primary";
    indicatorColor = "bg-primary";
    message = "Backend status unknown.";
  }

  return (
    <div className={`p-3 rounded-xl mb-4 flex items-center gap-2 text-sm font-medium hand-drawn ${bannerClass}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${indicatorColor}`} aria-hidden />
      <span className="flex-1">{message}</span>
      {(status === "unreachable" || status === "error") && (
        <button
          type="button"
          className="px-3 py-1 rounded-lg border-2 border-current bg-card-background/50 text-current cursor-pointer text-xs font-semibold hover:bg-card-background hand-drawn-btn"
          onClick={() => void checkHealth()}
        >
          Retry
        </button>
      )}
    </div>
  );
}

interface HelpOverlayProps {
  onClose: () => void;
}

function HelpOverlay({ onClose }: HelpOverlayProps) {
  const shortcuts = [
    { key: "Enter", description: "Submit your answer (when answer field is not focused)" },
    { key: "N", description: "Complete card - Mark as done for this session" },
    { key: "B", description: "Review Later - Add to end of queue" },
    { key: "?", description: "Toggle this help overlay" }
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card-background border-4 border-primary rounded-2xl p-8 max-w-2xl w-full shadow-2xl hand-drawn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold m-0 text-text-color font-display">Keyboard Shortcuts</h2>
          <button
            type="button"
            className="w-10 h-10 rounded-full border-2 border-border-color bg-card-background text-text-color font-bold hand-drawn-btn hover:bg-paper-line flex items-center justify-center text-xl"
            onClick={onClose}
            aria-label="Close help"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.key}
              className="flex items-center gap-4 p-4 rounded-xl bg-paper-line/30 border-2 border-border-color/30"
            >
              <kbd className="px-4 py-2 rounded-lg bg-primary text-white font-bold text-lg min-w-[4rem] text-center shadow-md">
                {shortcut.key}
              </kbd>
              <p className="m-0 text-text-color text-base flex-1">{shortcut.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t-2 border-border-color/30">
          <p className="text-sm text-text-muted m-0 text-center">
            Press <kbd className="px-2 py-1 rounded bg-primary/20 text-primary font-semibold">?</kbd> anytime to toggle this help
          </p>
        </div>
      </div>
    </div>
  );
}

interface SessionSummaryProps {
  deckTitle: string;
  session: SessionQueueState;
  onRestart?: () => void;
  onReturnHome?: () => void;
}

function SessionSummary({ deckTitle, session, onRestart, onReturnHome }: SessionSummaryProps) {
  // Count unique cards reviewed
  const uniqueCardIds = new Set(session.completed.map((entry) => entry.card.id));
  const cardsReviewed = uniqueCardIds.size;

  // Count by verdict quality
  const verdictCounts = session.completed.reduce<Record<string, number>>((acc, entry) => {
    if (entry.verdict) {
      acc[entry.verdict] = (acc[entry.verdict] ?? 0) + 1;
    }
    return acc;
  }, {});

  const perfectCount = verdictCounts.correct ?? 0;
  const needsPracticeCount =
    (verdictCounts.almost ?? 0) + (verdictCounts.missing ?? 0) + (verdictCounts.incorrect ?? 0);

  return (
    <div className="mt-6 p-8 rounded-xl flashcard paper-texture">
      <h3 className="text-2xl font-bold m-0 mb-3 text-text-color font-display">Session complete</h3>
      <p className="text-base text-text-muted my-2">
        You reviewed {cardsReviewed} card{cardsReviewed !== 1 ? "s" : ""} from <strong>{deckTitle}</strong>.
      </p>
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))] mt-6">
        <div className="border-2 border-border-color/40 rounded-xl p-5 bg-card-background/60 shadow-sm">
          <p className="text-4xl font-bold m-0 text-primary">{cardsReviewed}</p>
          <p className="mt-2 text-text-muted text-sm">Cards Reviewed</p>
        </div>
        <div className="border-2 border-correct-green/40 rounded-xl p-5 bg-correct-green/10 shadow-sm">
          <p className="text-4xl font-bold m-0 text-correct-green">{perfectCount}</p>
          <p className="mt-2 text-text-muted text-sm">Perfect Answers</p>
        </div>
        <div className="border-2 border-warning-amber/40 rounded-xl p-5 bg-warning-amber/10 shadow-sm">
          <p className="text-4xl font-bold m-0 text-warning-amber">{needsPracticeCount}</p>
          <p className="mt-2 text-text-muted text-sm">Need Practice</p>
        </div>
      </div>
      {(onRestart || onReturnHome) && (
        <div className="flex gap-3 mt-6 flex-wrap">
          {onReturnHome && (
            <button
              type="button"
              className="px-5 py-2 rounded-full border-2 border-primary bg-card-background text-primary font-bold hand-drawn-btn hover:bg-primary/10 text-base"
              onClick={onReturnHome}
            >
              Return to Deck Home
            </button>
          )}
          {onRestart && (
            <button
              type="button"
              className="px-5 py-2 rounded-full bg-primary text-white font-bold hand-drawn-btn hover:bg-primary/90 text-base"
              onClick={onRestart}
            >
              Restart session
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function StudyPanel({ card, deckTitle, mode = "view", onReturnHome }: StudyPanelProps) {
  const [answer, setAnswer] = useState("");
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [sessionWasRestored, setSessionWasRestored] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const arrowContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [arrowOffset, setArrowOffset] = useState(0);
  const previousCardIdRef = useRef<string | null>(null);
  const status = useStudyStore((state) => state.status);
  const lastAttempt = useStudyStore((state) => state.lastAttempt);
  const attemptsByCard = useStudyStore((state) => state.attemptsByCard);
  const submitAnswer = useStudyStore((state) => state.submitAnswer);
  const session = useStudyStore((state) => state.session);
  const sessionStartedAt = useStudyStore((state) => state.sessionStartedAt);
  const dispatchSession = useStudyStore((state) => state.dispatchSession);
  const startSession = useStudyStore((state) => state.startSession);
  const resetSession = useStudyStore((state) => state.resetSession);
  const error = useStudyStore((state) => state.error);
  const clearError = useStudyStore((state) => state.clearError);
  const sessionPhase = session.phase;

  const updateDeck = useDeckStore((state) => state.updateDeck);
  const decks = useDeckStore((state) => state.decks);

  const sessionDeck = useDeckStore((state) => {
    if (!session.deckId) {
      return null;
    }
    return state.decks.find((item) => item.id === session.deckId) ?? null;
  });

  const handleRestartSession = () => {
    if (!sessionDeck || !session.deckId) {
      return;
    }
    // Filter out cards that were deleted after the session started
    const validCardIds = new Set(sessionDeck.cards.map((card) => card.id));
    const validCards = sessionDeck.cards.filter((card) => validCardIds.has(card.id));

    // Use current deck cards instead of session.completed to avoid deleted cards
    startSession(session.deckId, validCards);
  };

  const busy = status === "scoring";
  const verdictForCard = useMemo(() => {
    if (!card || !lastAttempt || lastAttempt.cardId !== card.id) {
      return null;
    }
    return lastAttempt;
  }, [card, lastAttempt]);

  const attempts = card ? attemptsByCard[card.id] ?? [] : [];

  // Detect if session was restored from localStorage
  useEffect(() => {
    if (session.deckId && sessionStartedAt && session.phase !== "empty" && session.phase !== "complete") {
      setSessionWasRestored(true);
    }
  }, []); // Only run once on mount

  // Restore draft answers when navigating to a new card
  useEffect(() => {
    const prevCardId = previousCardIdRef.current;
    const currentCardId = card?.id ?? null;

    // Only run when card actually changes
    if (prevCardId !== currentCardId) {
      // Clear error and form message when changing cards
      setFormMessage(null);
      clearError();

      // Restore draft answer for new card, or clear if no draft exists
      if (currentCardId) {
        setDraftAnswers(prev => {
          const draft = prev[currentCardId];
          setAnswer(draft ?? "");
          return prev;
        });
      } else {
        setAnswer("");
      }

      // Update ref for next transition
      previousCardIdRef.current = currentCardId;
    }
  }, [card?.id, clearError]);

  const submitCurrentAnswer = useCallback(async () => {
    if (!card || !card.answer) {
      return false;
    }
    if (busy) {
      return false;
    }
    const trimmed = answer.trim();
    if (trimmed.length === 0) {
      setFormMessage("Please enter an answer before submitting.");
      return false;
    }
    setFormMessage(null);
    const attempt = await submitAnswer({
      cardId: card.id,
      prompt: card.prompt,
      expectedAnswer: card.answer,
      keypoints: card.keypoints ?? [],
      userAnswer: trimmed,
      alternativeAnswers: card.alternativeAnswers ?? []
    });
    if (attempt) {
      setAnswer("");
      // Clear draft for this card since answer was successfully submitted
      setDraftAnswers(prev => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });
    }
    return Boolean(attempt);
  }, [answer, busy, card, submitAnswer]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitCurrentAnswer();
  };

  const handleKeydown = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }

    // Don't handle shortcuts if in edit or create mode (modal/editor is open)
    if (mode === "edit" || mode === "create") {
      return;
    }

    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName ?? "";
    const isEditable =
      target?.isContentEditable ||
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      tagName === "SELECT";

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      if (!isEditable && sessionPhase === "prompt") {
        if (card && card.answer && !busy && answer.trim().length > 0) {
          event.preventDefault();
          void submitCurrentAnswer();
        }
      }
    }

    // Handle "?" for help overlay (works everywhere except in editable fields)
    if (event.key === "?" && !isEditable) {
      event.preventDefault();
      setShowHelpOverlay(prev => !prev);
      return;
    }

    // Check if user is in an editable field for navigation shortcuts
    if (isEditable) {
      return;
    }

    // Allow navigation shortcuts at any time during study session (not just after verdict)
    if (sessionPhase !== "prompt" && sessionPhase !== "review") {
      return;
    }
    if (busy) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "b") {
      event.preventDefault();
      handleNavigateBack();
    } else if (key === "n") {
      event.preventDefault();
      handleNavigateNext();
    }
  }, [
    answer,
    busy,
    card,
    handleNavigateBack,
    handleNavigateNext,
    mode,
    sessionPhase,
    submitCurrentAnswer
  ]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [handleKeydown]);

  // Reset flip state when card changes
  useEffect(() => {
    setIsFlipped(false);
  }, [card?.id]);

  // Auto-flip to back after submitting to show verdict
  useEffect(() => {
    if (verdictForCard && sessionPhase === "review") {
      setIsFlipped(true);
    }
  }, [verdictForCard, sessionPhase]);

  // Calculate arrow vertical position to align with textarea bottom
  useEffect(() => {
    const updateArrowPosition = () => {
      if (textareaRef.current && arrowContainerRef.current) {
        const textareaRect = textareaRef.current.getBoundingClientRect();
        const arrowContainerRect = arrowContainerRef.current.getBoundingClientRect();

        // Calculate the textarea's bottom edge relative to the arrow container
        const textareaBottomY = textareaRect.bottom - arrowContainerRect.top;
        setArrowOffset(textareaBottomY);
      }
    };

    updateArrowPosition();

    // Watch for textarea changes that might affect height
    const resizeObserver = new ResizeObserver(updateArrowPosition);
    if (textareaRef.current) {
      resizeObserver.observe(textareaRef.current);
    }

    // Update on window resize
    window.addEventListener('resize', updateArrowPosition);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateArrowPosition);
    };
  }, [card?.id, isFlipped, verdictForCard]);

  if (sessionPhase === "complete") {
    return (
      <SessionSummary
        deckTitle={deckTitle}
        session={session}
        onRestart={sessionDeck ? handleRestartSession : undefined}
        onReturnHome={onReturnHome}
      />
    );
  }

  if (!card) {
    return (
      <div className="mt-6 p-8 rounded-xl flashcard paper-texture">
        <p className="text-text-muted text-lg font-display">Select a card in this deck to start studying.</p>
      </div>
    );
  }

  const verdictStyle = verdictForCard
    ? verdictPalette[verdictForCard.verdict] ?? verdictPalette.incorrect
    : null;

  const missingKeypoints = verdictForCard?.missingKeypoints ?? [];

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }
    const isModifierSubmit = event.ctrlKey || event.metaKey;
    const isPlainSubmit = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
    if (!isModifierSubmit && !isPlainSubmit) {
      return;
    }
    event.preventDefault();
    void submitCurrentAnswer();
  };

  const handleClearSession = () => {
    resetSession();
    setSessionWasRestored(false);
  };

  const handleMarkAsCorrect = async () => {
    if (!card || !lastAttempt || !sessionDeck) return;

    const userAnswer = lastAttempt.userAnswer.trim();
    if (!userAnswer) return;

    // Get the current alternative answers or initialize empty array
    const currentAlternatives = card.alternativeAnswers ?? [];

    // Don't add if it's already in the list
    if (currentAlternatives.includes(userAnswer)) {
      return;
    }

    // Add the user's answer to alternatives
    const updatedAlternatives = [...currentAlternatives, userAnswer];

    // Update the card in the deck
    const updatedCards: CardPayload[] = sessionDeck.cards.map((c) => ({
      id: c.id,
      prompt: c.prompt,
      answer: c.answer ?? "",
      keypoints: c.keypoints ?? [],
      schedule: c.schedule ?? null,
      archived: c.archived,
      gradingMode: c.gradingMode,
      alternativeAnswers: c.id === card.id ? updatedAlternatives : c.alternativeAnswers
    }));

    await updateDeck(sessionDeck.id, { cards: updatedCards });

    // Update the card in the current session so the new alternative answer is immediately available
    const updatedCard: CardSummary = {
      ...card,
      alternativeAnswers: updatedAlternatives
    };
    dispatchSession({ type: "syncCard", card: updatedCard });

    // Reset to front of card to try again with the new alternative answer
    setIsFlipped(false);
    setAnswer('');
  };

  // Navigation handlers that save draft before navigating
  const handleNavigateBack = useCallback(() => {
    if (busy) return;

    // Save current answer as draft if not empty
    if (card?.id && answer.trim()) {
      setDraftAnswers(prev => ({
        ...prev,
        [card.id]: answer
      }));
    }

    // Navigate with verdict if available, undefined otherwise
    dispatchSession({ type: "backOfPile", verdict: verdictForCard?.verdict });
  }, [busy, card, answer, verdictForCard, dispatchSession]);

  const handleNavigateNext = useCallback(() => {
    if (busy) return;

    // Save current answer as draft if not empty
    if (card?.id && answer.trim()) {
      setDraftAnswers(prev => ({
        ...prev,
        [card.id]: answer
      }));
    }

    // Navigate with verdict if available, undefined otherwise
    dispatchSession({ type: "next", verdict: verdictForCard?.verdict });
  }, [busy, card, answer, verdictForCard, dispatchSession]);

  const showRestorationBanner =
    sessionWasRestored &&
    sessionStartedAt &&
    sessionDeck &&
    session.phase !== "complete" &&
    session.phase !== "empty";

  return (
    <div ref={containerRef} className="mt-6">
      {showRestorationBanner && (
        <SessionRestorationBanner
          deckTitle={sessionDeck.title}
          sessionStartedAt={sessionStartedAt}
          progress={{
            completed: session.completed.length,
            total: session.total
          }}
          onClearSession={handleClearSession}
        />
      )}
      <BackendStatusBanner />

      <div className="flex items-center justify-between mb-4">
        <p className="text-text-muted text-sm m-0">
          Studying from <strong className="text-primary">{deckTitle}</strong>
        </p>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border-2 border-border-color/50 bg-card-background text-text-muted hover:bg-paper-line hover:text-text-color hover:border-primary/50 text-xs font-medium transition-colors hand-drawn-btn flex items-center gap-1.5"
          onClick={() => setShowHelpOverlay(true)}
          title="View keyboard shortcuts"
        >
          <span className="text-sm">⌨</span>
          <span>Press ? for shortcuts</span>
        </button>
      </div>

      {/* Progress Indicator */}
      {session.total > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-card-background border-2 border-border-color/40 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-text-color m-0">
              Card {session.completed.length + 1} of {session.total}
            </p>
            <p className="text-xs text-text-muted m-0">
              {Math.round(((session.completed.length) / session.total) * 100)}% complete
            </p>
          </div>
          <div className="w-full h-2 bg-border-color/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
              style={{ width: `${(session.completed.length / session.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Flip Card Container with Arrow Navigation */}
      <div ref={arrowContainerRef} className="flex items-start gap-4">
        {/* Left Arrow - Review Later */}
        <button
          type="button"
          className="w-12 h-12 rounded-full border-2 border-border-color bg-card-background text-text-color font-bold hand-drawn-btn hover:bg-paper-line disabled:opacity-50 flex items-center justify-center text-2xl flex-shrink-0"
          style={{
            marginTop: `${arrowOffset}px`
          }}
          onClick={handleNavigateBack}
          disabled={busy}
          aria-label="Review Later"
          title="Review Later - Add to end of queue (B)"
        >
          ←
        </button>

        {/* Card */}
        <div className="flex-1">
          <div ref={cardRef} className={`flip-card ${isFlipped ? 'flipped' : ''}`}>
            <div className="flip-card-inner">
            {/* Front of Card - Shows Question & Answer Input */}
            {!isFlipped && (
              <div className="flip-card-front">
                <div className="p-10 rounded-xl flashcard paper-texture flex flex-col min-h-[400px]">
                  <h3 className="text-3xl font-bold m-0 mb-6 text-text-color font-display">{card.prompt}</h3>

                  <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
                    <textarea
                      ref={textareaRef}
                      className="w-full flex-1 min-h-[12rem] resize-y hand-drawn-input text-text-color focus:outline-none text-base mb-4 leading-relaxed font-sans"
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      onKeyDown={handleTextareaKeyDown}
                      placeholder="Write your answer here..."
                      disabled={busy}
                      style={{ lineHeight: '2rem' }}
                      autoFocus
                    />
                    <div className="flex justify-between items-center gap-4 flex-wrap">
                      <button
                        type="submit"
                        className="px-8 py-3 rounded-full bg-primary text-white font-bold hand-drawn-btn hover:bg-primary-dark disabled:opacity-50 text-lg shadow-lg"
                        disabled={busy || !card.answer}
                      >
                        {busy ? "Scoring..." : "Submit & Flip"}
                      </button>
                      {verdictForCard && (
                        <button
                          type="button"
                          className="px-6 py-3 rounded-full border-2 border-primary bg-primary/10 text-primary font-semibold hand-drawn-btn hover:bg-primary/20 text-base"
                          onClick={() => setIsFlipped(true)}
                        >
                          View Results
                        </button>
                      )}
                    </div>
                    {busy && (
                      <div className="flex items-center gap-2 text-sm text-primary font-medium mt-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                          <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                        </div>
                        <span>Evaluating your answer with AI…</span>
                      </div>
                    )}
                    {formMessage && <p className="mt-3 p-3 rounded-xl bg-warning-amber/30 border-2 border-warning-amber text-text-color text-sm hand-drawn">{formMessage}</p>}
                    {error && <p className="mt-3 p-3 rounded-xl bg-incorrect-red/20 border-2 border-incorrect-red text-text-color text-sm hand-drawn">{error}</p>}
                  </form>
                </div>
              </div>
            )}

            {/* Back of Card - Shows Results & Feedback */}
            {isFlipped && (
              <div className="flip-card-back">
                <div
                  className="p-10 rounded-xl flashcard paper-texture flex flex-col min-h-[400px]"
                  style={{
                    backgroundColor: verdictStyle?.bg,
                    borderColor: verdictStyle?.borderColor
                  }}
                >
                  <h3 className="text-2xl font-bold m-0 mb-6 font-display" style={{ color: verdictStyle?.color }}>{card.prompt}</h3>

                  {verdictForCard && verdictStyle ? (
                    <div className="flex flex-col gap-2">
                      <p className="m-0 mb-4 text-xl font-semibold" style={{ color: verdictStyle.color }}>
                        {verdictStyle.label}
                      </p>
                      {verdictForCard.feedback && <p className="m-0 text-base whitespace-pre-wrap mb-4" style={{ color: verdictStyle.color }}>{verdictForCard.feedback}</p>}

                      {/* Show missing keypoints prominently if any */}
                      {missingKeypoints.length > 0 && (
                        <div className="mb-4 p-3 rounded-xl bg-card-background/90 border-2 border-text-color/20 shadow-sm">
                          <p className="text-sm font-semibold text-text-color m-0 mb-2">
                            Missing Key Concepts ({missingKeypoints.length})
                          </p>
                          <ul className="m-0 pl-5 text-text-color text-sm">
                            {missingKeypoints.map((keypoint) => (
                              <li key={keypoint} className="mb-1">
                                {keypoint}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Show user's answer */}
                      {verdictForCard.userAnswer && (
                        <div className="p-4 rounded-xl bg-card-background/90 border-2 border-text-color/20 shadow-sm mb-3">
                          <p className="text-xs font-bold text-text-muted uppercase tracking-wider m-0 mb-2">Your Answer</p>
                          <p className="m-0 text-base text-text-color leading-relaxed font-sans">{verdictForCard.userAnswer}</p>
                        </div>
                      )}

                      {/* Show expected answer */}
                      {card.answer && (
                        <div className="p-4 rounded-xl bg-card-background/90 border-2 border-text-color/20 shadow-sm">
                          <p className="text-xs font-bold text-text-muted uppercase tracking-wider m-0 mb-2">Expected Answer</p>
                          <p className="m-0 text-base text-text-color leading-relaxed font-sans">{card.answer}</p>
                        </div>
                      )}

                      {/* Action buttons for incorrect/almost answers */}
                      {(verdictForCard.verdict === 'incorrect' || verdictForCard.verdict === 'almost' || verdictForCard.verdict === 'missing') && (
                        <div className="mt-4 flex gap-3 flex-wrap">
                          <button
                            type="button"
                            className="flex-1 px-6 py-3 rounded-full border-2 border-primary bg-card-background text-primary font-bold hand-drawn-btn hover:bg-primary/10 text-base"
                            onClick={() => {
                              setIsFlipped(false);
                              setAnswer('');
                            }}
                          >
                            Try Again
                          </button>
                          {(verdictForCard.verdict === 'almost' || verdictForCard.verdict === 'missing') && (
                            <button
                              type="button"
                              className="flex-1 px-6 py-3 rounded-full bg-correct-green text-white font-bold hand-drawn-btn hover:bg-correct-green/90 text-base"
                              onClick={handleMarkAsCorrect}
                            >
                              Mark as Correct
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-text-muted text-lg mb-4">Submit your answer on the front to see results</p>
                        <button
                          type="button"
                          className="px-6 py-3 rounded-full border-2 border-border-color bg-card-background text-text-color font-semibold hand-drawn-btn hover:bg-paper-line text-base"
                          onClick={() => setIsFlipped(false)}
                        >
                          Flip back
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Right Arrow - Complete */}
        <button
          type="button"
          className="w-12 h-12 rounded-full border-2 border-border-color bg-card-background text-text-color font-bold hand-drawn-btn hover:bg-paper-line disabled:opacity-50 flex items-center justify-center text-2xl flex-shrink-0"
          style={{
            marginTop: `${arrowOffset}px`
          }}
          onClick={handleNavigateNext}
          disabled={busy}
          aria-label="Complete"
          title="Complete - Mark as done for this session (N)"
        >
          →
        </button>
      </div>

      {/* Help Overlay */}
      {showHelpOverlay && <HelpOverlay onClose={() => setShowHelpOverlay(false)} />}
    </div>
  );
}
