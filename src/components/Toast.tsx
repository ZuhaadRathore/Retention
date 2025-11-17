import { useEffect, useState } from "react";

export interface ToastMessage {
  id: string;
  message: string;
  type: "success" | "info" | "warning" | "error";
  duration?: number;
}

interface ToastProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    const duration = toast.duration ?? 3000;
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast, onClose]);

  const typeStyles = {
    success: "bg-correct-green text-white border-correct-green",
    info: "bg-primary/10 text-primary border-primary",
    warning: "bg-orange-100 text-orange-800 border-orange-400",
    error: "bg-incorrect-red text-white border-incorrect-red"
  };

  return (
    <div
      className={`${typeStyles[toast.type]} px-6 py-3 rounded-xl border-2 shadow-lg hand-drawn-card mb-3 animate-slide-in-right flex items-center justify-between gap-3`}
      role="alert"
    >
      <span className="text-sm font-semibold">{toast.message}</span>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        className="text-lg opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 max-w-md">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}

// Hook for managing toasts
export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (message: string, type: ToastMessage["type"] = "info", duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  };

  const closeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return { toasts, showToast, closeToast };
}
