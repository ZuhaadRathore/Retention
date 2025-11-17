/**
 * Backend Store
 * Manages connection state and health checks for the Retention backend server
 * (Previously sidecarStore - refactored for client-server architecture)
 */

import { create } from "zustand";
import { api, type ApiHealth } from "../services/api";

export type BackendStatus = "unknown" | "checking" | "healthy" | "unreachable" | "error";

export type LogLevel = "info" | "error" | "warning";

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string;
}

interface BackendState {
  status: BackendStatus;
  lastCheckedAt: string | null;
  health: ApiHealth | null;
  logs: LogEntry[];
  databaseState: string | null;
  modelCacheState: string | null;
  modelCacheMessage: string | null;

  // Actions
  checkHealth: () => Promise<void>;
  addLog: (entry: { level: LogLevel; message: string; timestamp?: string }) => void;
  setStatus: (status: BackendStatus) => void;
  clearLogs: () => void;
}

const MAX_LOGS = 200;

function makeLogId(level: LogLevel, timestamp: string): string {
  const random = Math.random().toString(16).slice(2, 8);
  return `${timestamp}-${level}-${random}`;
}

export const useBackendStore = create<BackendState>((set) => ({
  status: "unknown",
  lastCheckedAt: null,
  health: null,
  logs: [],
  databaseState: null,
  modelCacheState: null,
  modelCacheMessage: null,

  async checkHealth() {
    set({ status: "checking" });
    try {
      const health = await api.checkHealth();

      let status: BackendStatus = "healthy";
      if (health.status === "initializing") {
        status = "checking";
      } else if (health.status !== "ok") {
        status = "error";
      }

      set({
        status,
        health,
        databaseState: health.database ?? null,
        modelCacheState: health.modelCache ?? null,
        modelCacheMessage: health.modelCacheMessage ?? null,
        lastCheckedAt: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      set({
        status: "unreachable",
        health: null,
        databaseState: null,
        modelCacheState: null,
        modelCacheMessage: `Failed to connect: ${errorMessage}`,
        lastCheckedAt: new Date().toISOString(),
      });
    }
  },

  addLog({ level, message, timestamp }) {
    const ts = timestamp ?? new Date().toISOString();
    const entry: LogEntry = {
      id: makeLogId(level, ts),
      level,
      message,
      timestamp: ts,
    };

    set((state) => ({
      logs: [entry, ...state.logs].slice(0, MAX_LOGS),
    }));
  },

  setStatus(status) {
    set({ status });
  },

  clearLogs() {
    set({ logs: [] });
  },
}));

// Compatibility export for existing code
export { useBackendStore as useSidecarStore };
