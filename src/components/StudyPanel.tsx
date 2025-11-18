import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useDeckStore } from "../store/deckStore";
import { useStudyStore } from "../store/studyStore";
import { useBackendStore } from "../store/backendStore";
import { ONE_MINUTE_MS, ONE_HOUR_MS, ONE_DAY_MS, MAX_SESSION_AGE_MS, SESSION_WARNING_THRESHOLD_MS } from "../constants/time";
import type { CardSummary, CardPayload } from "../types/deck";
import type { AttemptRecord } from "../types/study";
import type { SessionQueueState } from "../store/sessionQueue";
import { useToast, ToastContainer } from "./Toast";
import { AlternativeAnswersInfo } from "./AlternativeAnswersInfo";
import { useAutoResizeTextarea } from "../hooks/useAutoResizeTextarea";
import { usePlainTextPaste } from "../hooks/usePlainTextPaste";

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

interface AttemptHistoryProps {
  attempts: AttemptRecord[];
  onDeleteAttempt?: (attemptId: string) => void;
}

function AttemptHistory({ attempts, onDeleteAttempt }: AttemptHistoryProps) {
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);

  if (!attempts.length) {
    return <p className="text-text-muted text-sm italic">No prior attempts logged for this card.</p>;
  }

  const toggleExpand = (attemptId: string) => {
    setExpandedAttempt(prev => prev === attemptId ? null : attemptId);
  };

  return (
    <div className="flex flex-col gap-2">
      {attempts.map((attempt) => {
        const isExpanded = expandedAttempt === attempt.id;
        const style = verdictPalette[attempt.verdict];

        return (
          <div
            key={attempt.id}
            className="border-2 border-border-color rounded-lg overflow-hidden bg-card-background shadow-sm"
          >
            {/* Summary Row - Clickable */}
            <button
              type="button"
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-paper-line transition-colors text-left"
              onClick={() => toggleExpand(attempt.id)}
            >
              <span className="text-lg flex-shrink-0">{isExpanded ? '▼' : '▶'}</span>
              <div className="flex-1 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center text-sm">
                <span className="text-text-muted truncate">{formatTimestamp(attempt.createdAt)}</span>
                <span
                  className="px-2 py-1 rounded font-semibold text-xs"
                  style={{ backgroundColor: style?.bg, color: style?.color }}
                >
                  {style?.label ?? attempt.verdict}
                </span>
                <span className="text-text-color font-mono">Score: {attempt.score.toFixed(2)}</span>
                <span className="text-text-muted text-xs">
                  Cosine: {attempt.cosine.toFixed(2)} | Coverage: {attempt.coverage.toFixed(2)}
                </span>
              </div>
            </button>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t-2 border-border-color/30 pt-3">
                {/* User Answer */}
                {attempt.userAnswer && (
                  <div className="mb-3">
                    <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Your Answer</p>
                    <p className="text-sm text-text-color bg-card-background/60 p-3 rounded-lg border border-border-color/30">
                      {attempt.userAnswer}
                    </p>
                  </div>
                )}

                {/* AI Feedback */}
                {attempt.feedback && (
                  <div className="mb-3">
                    <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">AI Feedback</p>
                    <p className="text-sm text-text-color bg-card-background/60 p-3 rounded-lg border border-border-color/30 whitespace-pre-wrap">
                      {attempt.feedback}
                    </p>
                  </div>
                )}

                {/* Missing Keypoints */}
                {attempt.missingKeypoints && attempt.missingKeypoints.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">Missing Keypoints</p>
                    <ul className="text-sm text-text-color bg-warning-amber/10 p-3 rounded-lg border border-warning-amber/30 list-disc pl-5">
                      {attempt.missingKeypoints.map((keypoint, idx) => (
                        <li key={idx}>{keypoint}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 mt-3">
                  {onDeleteAttempt && (
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg bg-incorrect-red text-white text-xs font-semibold hover:bg-incorrect-red/90"
                      onClick={() => onDeleteAttempt(attempt.id)}
                    >
                      Delete Attempt
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatSessionAge(timestampMs: number): string {
  const ageMs = Date.now() - timestampMs;
  const minutes = Math.floor(ageMs / ONE_MINUTE_MS);
  const hours = Math.floor(ageMs / ONE_HOUR_MS);
  const days = Math.floor(ageMs / ONE_DAY_MS);

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
    <div className="p-2 px-3 rounded-lg mb-3 bg-primary/10 border border-primary/30 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-primary font-semibold flex-shrink-0">↻</span>
        <p className="m-0 text-text-color truncate">
          Session restored: {progress.completed}/{progress.total} cards reviewed from {formatSessionAge(sessionStartedAt)}
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          type="button"
          className="text-text-muted hover:text-text-color text-xs underline"
          onClick={onClearSession}
          title="Start a fresh session"
        >
          Reset
        </button>
        <button
          type="button"
          className="text-text-muted hover:text-text-color font-bold text-xs"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function BackendStatusBanner() {
  const status = useBackendStore((state) => state.status);
  const checkHealth = useBackendStore((state) => state.checkHealth);

  // Only show for error/unreachable states
  if (status !== "unreachable" && status !== "error") {
    return null;
  }

  return (
    <div className="p-2 px-3 rounded-lg mb-3 bg-incorrect-red/20 text-text-color border border-incorrect-red/40 flex items-center gap-2 text-sm">
      <span className="w-2 h-2 rounded-full flex-shrink-0 bg-incorrect-red" aria-hidden />
      <span className="flex-1">Backend offline. Answers cannot be scored.</span>
      <button
        type="button"
        className="px-2 py-1 rounded-lg border border-current bg-card-background/50 text-current cursor-pointer text-xs font-semibold hover:bg-card-background"
        onClick={() => void checkHealth()}
      >
        Retry
      </button>
    </div>
  );
}

interface SessionTimeoutWarningProps {
  sessionStartedAt: number;
}

function SessionTimeoutWarning({ sessionStartedAt }: SessionTimeoutWarningProps) {
  const sessionAge = Date.now() - sessionStartedAt;
  const hoursRemaining = Math.ceil((MAX_SESSION_AGE_MS - sessionAge) / ONE_HOUR_MS);

  // Only show warning if session is older than 23 hours but not expired
  if (sessionAge < SESSION_WARNING_THRESHOLD_MS || sessionAge >= MAX_SESSION_AGE_MS) {
    return null;
  }

  return (
    <div className="p-2 px-3 rounded-lg mb-3 bg-warning-amber/20 text-text-color border border-warning-amber/40 flex items-center gap-2 text-sm">
      <span className="text-warning-amber font-semibold flex-shrink-0">⚠</span>
      <span className="flex-1">
        Session expiring soon! This session will reset in about {hoursRemaining} hour{hoursRemaining !== 1 ? 's' : ''}.
        Complete your cards or your progress will be lost.
      </span>
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
  sessionStartedAt?: number | null;
  onRestart?: () => void;
  onReturnHome?: () => void;
}

function SessionSummary({ deckTitle, session, sessionStartedAt, onRestart, onReturnHome }: SessionSummaryProps) {
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

  // Calculate accuracy percentage
  const totalAttempts = session.completed.length;
  const accuracyPercent = totalAttempts > 0 ? Math.round((perfectCount / totalAttempts) * 100) : 0;

  // Calculate time spent (rough estimate based on session duration)
  const sessionDuration = sessionStartedAt ? Date.now() - sessionStartedAt : 0;
  const minutesSpent = Math.max(1, Math.round(sessionDuration / (60 * 1000)));

  // Find cards that need review (those with incorrect/almost/missing verdicts)
  const cardsNeedingReview = session.completed
    .filter((entry) => entry.verdict && ['incorrect', 'almost', 'missing'].includes(entry.verdict))
    .map((entry) => entry.card)
    .filter((card, index, self) => self.findIndex(c => c.id === card.id) === index) // unique cards
    .slice(0, 3); // top 3

  // Motivational message based on performance
  const getMotivationalMessage = () => {
    if (accuracyPercent >= 90) {
      return "Outstanding work! You've mastered this material! 🌟";
    } else if (accuracyPercent >= 75) {
      return "Great job! You're making excellent progress! 💪";
    } else if (accuracyPercent >= 50) {
      return "Good effort! Keep practicing to improve! 📚";
    } else {
      return "Keep going! Practice makes perfect! 🎯";
    }
  };

  return (
    <div className="mt-6 p-8 rounded-xl flashcard paper-texture">
      <h3 className="text-2xl font-bold m-0 mb-3 text-text-color font-display">Session complete</h3>
      <p className="text-base text-text-muted my-2">
        You reviewed {cardsReviewed} card{cardsReviewed !== 1 ? "s" : ""} from <strong>{deckTitle}</strong> in {minutesSpent} minute{minutesSpent !== 1 ? 's' : ''}.
      </p>

      {/* Motivational message */}
      <div className="p-4 rounded-xl bg-primary/10 border-2 border-primary/30 mb-6 mt-4">
        <p className="text-base font-semibold text-primary m-0">{getMotivationalMessage()}</p>
      </div>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] mt-6">
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
        <div className="border-2 border-primary/40 rounded-xl p-5 bg-primary/10 shadow-sm">
          <p className="text-4xl font-bold m-0 text-primary">{accuracyPercent}%</p>
          <p className="mt-2 text-text-muted text-sm">Accuracy</p>
        </div>
      </div>

      {/* Recommendations */}
      {cardsNeedingReview.length > 0 && (
        <div className="mt-6 p-5 rounded-xl bg-warning-amber/10 border-2 border-warning-amber/30">
          <p className="text-base font-bold text-text-color m-0 mb-3">📋 Recommended Review</p>
          <p className="text-sm text-text-muted mb-3">Focus on these cards in your next session:</p>
          <ul className="m-0 pl-5 text-text-color text-sm space-y-2">
            {cardsNeedingReview.map((card) => (
              <li key={card.id} className="font-medium">{card.prompt}</li>
            ))}
          </ul>
        </div>
      )}
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
  const [showAlternativeAnswersInfo, setShowAlternativeAnswersInfo] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showReportIssue, setShowReportIssue] = useState(false);
  const [reportComment, setReportComment] = useState("");
  const { toasts, showToast, closeToast } = useToast();
  const cardRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const arrowContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(answer, 192, 500); // min: 12rem (192px), max: 500px
  const [arrowOffset, setArrowOffset] = useState(0);
  const handlePlainTextPaste = usePlainTextPaste();
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

  // Performance: Use ref pattern to avoid excessive event listener add/remove cycles
  const handleKeydownRef = useRef(handleKeydown);
  useEffect(() => {
    handleKeydownRef.current = handleKeydown;
  }, [handleKeydown]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => handleKeydownRef.current(e);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []); // Empty deps - listener is stable, but calls latest handleKeydown via ref

  // Reset flip state and hints when card changes
  useEffect(() => {
    setIsFlipped(false);
    setShowHints(false);
    setShowReportIssue(false);
    setReportComment("");
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
        sessionStartedAt={sessionStartedAt}
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
      showToast("This answer is already in your accepted alternatives", "info");
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

    // Show success notification
    showToast("Added to accepted alternatives! Try your answer again.", "success");

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

  const handleReportIssue = useCallback(() => {
    if (!card || !verdictForCard) return;

    // Create report data
    const reportData = {
      cardId: card.id,
      prompt: card.prompt,
      expectedAnswer: card.answer,
      userAnswer: verdictForCard.userAnswer,
      aiVerdict: verdictForCard.verdict,
      aiFeedback: verdictForCard.feedback,
      score: verdictForCard.score,
      cosine: verdictForCard.cosine,
      coverage: verdictForCard.coverage,
      userComment: reportComment.trim(),
      timestamp: new Date().toISOString()
    };

    // For now, just copy to clipboard and show toast
    // In a real implementation, this would send to a backend endpoint
    navigator.clipboard.writeText(JSON.stringify(reportData, null, 2))
      .then(() => {
        showToast("Issue report copied to clipboard. Please share with the development team.", "success");
        setShowReportIssue(false);
        setReportComment("");
      })
      .catch(() => {
        showToast("Failed to copy report. Please try again.", "error");
      });
  }, [card, verdictForCard, reportComment, showToast]);

  const showRestorationBanner =
    sessionWasRestored &&
    sessionStartedAt &&
    sessionDeck &&
    session.phase !== "complete" &&
    session.phase !== "empty";

  return (
    <div ref={containerRef} className="mt-6">
      <ToastContainer toasts={toasts} onClose={closeToast} />
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
      {sessionStartedAt && <SessionTimeoutWarning sessionStartedAt={sessionStartedAt} />}

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
                      className="w-full flex-1 resize-none overflow-hidden hand-drawn-input text-text-color focus:outline-none text-base mb-4 leading-relaxed font-sans"
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      onKeyDown={handleTextareaKeyDown}
                      onPaste={handlePlainTextPaste}
                      placeholder="Write your answer here..."
                      disabled={busy}
                      style={{ lineHeight: '2rem' }}
                      autoFocus
                    />
                    {/* Hints section */}
                    {card.keypoints && card.keypoints.length > 0 && (
                      <div className="mb-4">
                        {!showHints ? (
                          <button
                            type="button"
                            className="px-4 py-2 rounded-lg border-2 border-border-color bg-card-background text-text-muted hover:bg-paper-line hover:text-text-color text-sm hand-drawn-btn"
                            onClick={() => setShowHints(true)}
                          >
                            💡 Show Hints ({card.keypoints.length} keypoints)
                          </button>
                        ) : (
                          <div className="p-4 rounded-xl bg-primary/10 border-2 border-primary/40 hand-drawn">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-bold text-primary m-0">💡 Hints (Key Concepts to Include)</p>
                              <button
                                type="button"
                                className="text-xs text-text-muted hover:text-text-color underline"
                                onClick={() => setShowHints(false)}
                              >
                                Hide
                              </button>
                            </div>
                            <ul className="m-0 pl-5 text-text-color text-sm space-y-1">
                              {card.keypoints.map((keypoint, idx) => (
                                <li key={idx}>{keypoint}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

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
                        <div className="mb-4 p-4 rounded-xl bg-warning-amber/30 border-2 border-warning-amber shadow-md">
                          <div className="flex items-start gap-2 mb-2">
                            <span className="text-xl flex-shrink-0">⚠</span>
                            <p className="text-base font-bold text-text-color m-0">
                              Missing Key Concepts ({missingKeypoints.length})
                            </p>
                          </div>
                          <ul className="m-0 pl-5 text-text-color text-sm space-y-1">
                            {missingKeypoints.map((keypoint) => (
                              <li key={keypoint} className="font-medium">
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
                              // Keep the previous answer so user can edit it
                              if (verdictForCard?.userAnswer) {
                                setAnswer(verdictForCard.userAnswer);
                              }
                            }}
                          >
                            Try Again
                          </button>
                          <button
                            type="button"
                            className="flex-1 px-6 py-3 rounded-full bg-correct-green text-white font-bold hand-drawn-btn hover:bg-correct-green/90 text-base relative group"
                            onClick={handleMarkAsCorrect}
                            title="Add your answer as an accepted alternative for this card"
                          >
                            Accept My Answer
                            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-text-color text-card-background text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-lg z-10">
                              Add your answer as an accepted alternative
                            </span>
                          </button>
                        </div>
                      )}

                      {/* Alternative Answers Info Link */}
                      {(verdictForCard.verdict === 'incorrect' || verdictForCard.verdict === 'almost' || verdictForCard.verdict === 'missing') && (
                        <div className="mt-3 text-center">
                          <button
                            type="button"
                            onClick={() => setShowAlternativeAnswersInfo(true)}
                            className="text-xs text-primary hover:text-primary/80 underline transition-colors"
                          >
                            What are alternative answers?
                          </button>
                        </div>
                      )}

                      {/* Report Issue Section */}
                      <div className="mt-4">
                        {!showReportIssue ? (
                          <button
                            type="button"
                            onClick={() => setShowReportIssue(true)}
                            className="text-xs text-text-muted hover:text-text-color underline transition-colors flex items-center gap-1"
                          >
                            <span>⚠</span>
                            <span>Disagree with this verdict? Report an issue</span>
                          </button>
                        ) : (
                          <div className="p-4 rounded-xl bg-card-background/90 border-2 border-warning-amber/40">
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-sm font-bold text-text-color m-0">Report Grading Issue</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowReportIssue(false);
                                  setReportComment("");
                                }}
                                className="text-text-muted hover:text-text-color text-lg"
                              >
                                ×
                              </button>
                            </div>
                            <p className="text-xs text-text-muted mb-3">
                              Describe why you think the AI's verdict is incorrect. This will help improve the grading system.
                            </p>
                            <textarea
                              className="w-full hand-drawn-input text-text-color focus:outline-none text-sm min-h-[80px] resize-y mb-3"
                              value={reportComment}
                              onChange={(e) => setReportComment(e.target.value)}
                              onPaste={handlePlainTextPaste}
                              placeholder="e.g., My answer covered all the key points but was marked as missing keypoints..."
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={handleReportIssue}
                                disabled={!reportComment.trim()}
                                className="px-4 py-2 rounded-full bg-primary text-white font-semibold text-xs hand-drawn-btn hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Submit Report
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowReportIssue(false);
                                  setReportComment("");
                                }}
                                className="px-4 py-2 rounded-full border-2 border-border-color bg-card-background text-text-color font-semibold text-xs hand-drawn-btn hover:bg-paper-line"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Attempt History */}
                      {attempts.length > 0 && (
                        <div className="mt-6">
                          <h4 className="text-base font-bold text-text-color mb-3 font-display">
                            Previous Attempts ({attempts.length})
                          </h4>
                          <AttemptHistory attempts={attempts} />
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
      {showAlternativeAnswersInfo && <AlternativeAnswersInfo onClose={() => setShowAlternativeAnswersInfo(false)} />}
    </div>
  );
}
