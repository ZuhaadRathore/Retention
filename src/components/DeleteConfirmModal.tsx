import { useState } from "react";

interface DeleteConfirmModalProps {
  itemName: string;
  itemType: "deck" | "card";
  cardCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ itemName, itemType, cardCount, onConfirm, onCancel }: DeleteConfirmModalProps) {
  const [confirmText, setConfirmText] = useState("");
  const isConfirmed = confirmText === itemName;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-card-background border-4 border-incorrect-red rounded-2xl p-8 max-w-2xl w-full shadow-2xl hand-drawn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-6">
          <span className="text-5xl">⚠️</span>
          <h2 className="text-3xl font-bold m-0 text-incorrect-red font-display">Delete {itemType === "deck" ? "Deck" : "Card"}?</h2>
        </div>

        <div className="mb-6">
          <p className="text-base text-text-color mb-3">
            You are about to permanently delete <strong className="text-incorrect-red">"{itemName}"</strong>
          </p>

          {itemType === "deck" && cardCount !== undefined && cardCount > 0 && (
            <div className="p-4 rounded-xl bg-warning-amber/20 border-2 border-warning-amber/40 mb-4">
              <p className="text-sm text-text-color m-0">
                ⚠ This deck contains <strong>{cardCount} card{cardCount !== 1 ? 's' : ''}</strong>. All cards and their study history will be lost.
              </p>
            </div>
          )}

          <p className="text-sm text-text-muted mb-4">
            This action cannot be undone. All data will be permanently lost.
          </p>

          <div className="p-4 rounded-xl bg-card-background/60 border-2 border-border-color">
            <label className="text-sm font-semibold text-text-color block mb-2" htmlFor="confirm-input">
              Type <span className="text-incorrect-red font-bold">"{itemName}"</span> to confirm:
            </label>
            <input
              id="confirm-input"
              type="text"
              className="w-full hand-drawn-input text-text-color focus:outline-none text-base"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={itemName}
              autoFocus
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            className="px-6 py-3 rounded-full border-2 border-border-color bg-card-background text-text-color font-bold hand-drawn-btn hover:bg-paper-line text-base"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-6 py-3 rounded-full bg-incorrect-red text-white font-bold hand-drawn-btn hover:bg-incorrect-red/90 disabled:opacity-50 disabled:cursor-not-allowed text-base shadow-md"
            onClick={onConfirm}
            disabled={!isConfirmed}
          >
            Delete {itemType === "deck" ? "Deck" : "Card"}
          </button>
        </div>
      </div>
    </div>
  );
}
