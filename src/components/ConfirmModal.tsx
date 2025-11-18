import { ReactNode } from "react";

interface ConfirmModalProps {
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "warning" | "info";
}

/**
 * Reusable confirmation modal for user consent and important actions.
 */
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "info"
}: ConfirmModalProps) {
  const variantStyles = {
    danger: {
      border: "border-incorrect-red",
      button: "bg-incorrect-red hover:bg-incorrect-red/90 text-white"
    },
    warning: {
      border: "border-warning-amber",
      button: "bg-warning-amber hover:bg-warning-amber/90 text-text-color"
    },
    info: {
      border: "border-primary",
      button: "bg-primary hover:bg-primary-hover text-white"
    }
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        className={`max-w-md w-full bg-card-background border-2 ${styles.border} rounded-lg shadow-2xl p-6 space-y-4`}
      >
        <h2 className="text-xl font-bold text-text-color">{title}</h2>

        <div className="text-text-muted text-sm">
          {typeof message === "string" ? <p>{message}</p> : message}
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border-2 border-border-color bg-bg-elevated text-text-color font-semibold hover:bg-bg-hover transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg border-2 border-transparent font-semibold transition-colors ${styles.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
