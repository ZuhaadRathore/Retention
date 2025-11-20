import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface UpdateNotificationProps {
  onUpdateAvailable?: (version: string) => void;
}

export function UpdateNotification({ onUpdateAvailable }: UpdateNotificationProps) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for updates on mount (only in production)
    if (import.meta.env.PROD) {
      checkForUpdates();
    }

    // Listen for update progress events
    const unlistenProgress = listen<number>("update-progress", (event) => {
      setInstallProgress(Math.round(event.payload));
    });

    const unlistenDownloaded = listen("update-downloaded", () => {
      setInstallProgress(100);
    });

    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenDownloaded.then((fn) => fn());
    };
  }, []);

  const checkForUpdates = async () => {
    try {
      const result = await invoke<string>("check_for_updates");
      if (result.startsWith("Update available")) {
        setUpdateAvailable(true);
        setUpdateMessage(result);
        const version = result.replace("Update available: ", "");
        onUpdateAvailable?.(version);
      }
    } catch (err) {
      // Silently fail - don't show errors for update checks
      console.error("Update check failed:", err);
    }
  };

  const installUpdate = async () => {
    setIsInstalling(true);
    setError(null);
    setInstallProgress(0);

    try {
      const result = await invoke<string>("install_update");
      setUpdateMessage(result);

      // Show success message for a moment before restarting
      setTimeout(() => {
        // The app will be restarted automatically by the updater
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsInstalling(false);
    }
  };

  const dismissUpdate = () => {
    setUpdateAvailable(false);
    setError(null);
  };

  if (!updateAvailable && !error) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4">
      <div className="bg-primary/10 border-2 border-primary rounded-xl shadow-lg hand-drawn-card p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-primary mb-1">Update Available</h3>
            <p className="text-sm text-gray-700">{updateMessage}</p>
          </div>
          {!isInstalling && (
            <button
              type="button"
              onClick={dismissUpdate}
              className="text-lg opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss update notification"
            >
              ×
            </button>
          )}
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {isInstalling && (
          <div className="mb-3">
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300 ease-out"
                style={{ width: `${installProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1 text-center">
              {installProgress < 100 ? `Downloading... ${installProgress}%` : "Installing..."}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={installUpdate}
            disabled={isInstalling}
            className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isInstalling ? "Installing..." : "Install Update"}
          </button>
          {!isInstalling && (
            <button
              type="button"
              onClick={dismissUpdate}
              className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
            >
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
