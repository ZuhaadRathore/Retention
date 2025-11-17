import { invoke } from "@tauri-apps/api/tauri";
import { create } from "zustand";

interface ApiHealth {
  status: string;
  details?: Record<string, unknown> | null;
  database?: string;
  modelCache?: string;
  modelCacheMessage?: string | null;
}

export type SidecarStatus = "unknown" | "checking" | "healthy" | "unreachable" | "error";

export type SidecarLogLevel = "stdout" | "stderr" | "terminated" | "info" | "error";

export interface SidecarLogEntry {
  id: string;
  level: SidecarLogLevel;
  message: string;
  timestamp: string;
}

export interface ModelProgressEvent {
  state: string;
  message: string;
  progress?: number | null;
}

interface SidecarState {
  status: SidecarStatus;
  lastCheckedAt: string | null;
  health: ApiHealth | null;
  logs: SidecarLogEntry[];
  databaseState: string | null;
  modelCacheState: string | null;
  modelCacheMessage: string | null;
  modelDownloadProgress: number | null;
  checkHealth: () => Promise<void>;
  addLog: (entry: {
    level: SidecarLogLevel;
    message: string;
    timestamp?: string;
    statusOverride?: SidecarStatus;
  }) => void;
  setStatus: (status: SidecarStatus) => void;
  clearLogs: () => void;
  updateModelProgress: (payload: ModelProgressEvent) => void;
}

const MAX_LOGS = 200;

function makeLogId(level: SidecarLogLevel, timestamp: string): string {
  const random = Math.random().toString(16).slice(2, 8);
  return `${timestamp}-${level}-${random}`;
}

function parseModelLog(message: string): { state: string; detail: string } | null {
  if (!message.includes("[model]")) {
    return null;
  }
  const cleaned = message.replace("[model]", "").trim();
  const lowered = cleaned.toLowerCase();
  if (lowered.includes("failed")) {
    return { state: "error", detail: cleaned };
  }
  if (lowered.includes("embedding model ready")) {
    return { state: "ready", detail: cleaned };
  }
  if (lowered.includes("downloading")) {
    return { state: "downloading", detail: cleaned };
  }
  if (lowered.includes("loading cached")) {
    return { state: "loading", detail: cleaned };
  }
  if (lowered.includes("preparing")) {
    return { state: "initializing", detail: cleaned };
  }
  return null;
}

export const useSidecarStore = create<SidecarState>((set) => ({
  status: "unknown",
  lastCheckedAt: null,
  health: null,
  logs: [],
  databaseState: null,
  modelCacheState: null,
  modelCacheMessage: null,
  modelDownloadProgress: null,
  async checkHealth() {
    set({ status: "checking" });
    try {
      const health = await invoke<ApiHealth>("check_sidecar_health");
      let status: SidecarStatus = "healthy";
      if (health.status === "initializing") {
        status = "checking";
      } else if (health.status !== "ok") {
        status = "error";
      }
      set((state) => ({
        status,
        health,
        databaseState: health.database ?? null,
        modelCacheState: health.modelCache ?? null,
        modelCacheMessage: health.modelCacheMessage ?? null,
        modelDownloadProgress: health.modelCache === "ready" ? 100 : state.modelDownloadProgress,
        lastCheckedAt: new Date().toISOString()
      }));
    } catch (error) {
      set((state) => ({
        status: "unreachable",
        health: null,
        databaseState: null,
        modelCacheState: null,
        modelCacheMessage: null,
        modelDownloadProgress: state.modelDownloadProgress,
        lastCheckedAt: new Date().toISOString()
      }));
    }
  },
  addLog({ level, message, timestamp, statusOverride }) {
    const ts = timestamp ?? new Date().toISOString();
    const entry: SidecarLogEntry = {
      id: makeLogId(level, ts),
      level,
      message,
      timestamp: ts
    };
    set((state) => {
      const logs = [entry, ...state.logs].slice(0, MAX_LOGS);
      const modelUpdate = parseModelLog(message);
      let nextStatus = statusOverride ?? state.status;
      if (!statusOverride && modelUpdate) {
        if (modelUpdate.state === "ready" && state.status !== "unreachable" && state.status !== "error") {
          nextStatus = "healthy";
        } else if (modelUpdate.state === "error") {
          nextStatus = "error";
        } else if (state.status === "healthy" || state.status === "unknown") {
          nextStatus = "checking";
        }
      }
      return {
        logs,
        status: nextStatus,
        modelCacheState: modelUpdate?.state ?? state.modelCacheState,
        modelCacheMessage: modelUpdate?.detail ?? state.modelCacheMessage,
        modelDownloadProgress:
          modelUpdate?.state === "ready"
            ? 100
            : modelUpdate?.state === "error"
              ? null
              : state.modelDownloadProgress
      };
    });
  },
  setStatus(status) {
    set({ status });
  },
  clearLogs() {
    set({ logs: [] });
  },
  updateModelProgress(payload) {
    set((state) => {
      const { state: modelState, message, progress } = payload;

      let nextStatus = state.status;
      if (modelState === "ready" && state.status !== "unreachable" && state.status !== "error") {
        nextStatus = "healthy";
      } else if (modelState === "error") {
        nextStatus = "error";
      } else if (modelState === "downloading" && state.status === "healthy") {
        nextStatus = "checking";
      } else if (modelState === "initializing" && state.status === "unknown") {
        nextStatus = "checking";
      }

      let nextProgress = state.modelDownloadProgress;
      if (typeof progress === "number" && Number.isFinite(progress)) {
        const bounded = Math.max(0, Math.min(100, Math.round(progress)));
        nextProgress = bounded;
      } else if (modelState === "ready") {
        nextProgress = 100;
      } else if (modelState === "error") {
        nextProgress = null;
      }

      return {
        status: nextStatus,
        modelCacheState: modelState ?? state.modelCacheState,
        modelCacheMessage: message ?? state.modelCacheMessage,
        modelDownloadProgress: nextProgress
      };
    });
  }
}));
