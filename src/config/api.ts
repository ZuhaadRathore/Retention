/**
 * API Configuration
 * Centralized configuration for backend API endpoints
 */

import { invoke } from "@tauri-apps/api/core";

// Default backend URL (used in dev mode or as fallback)
const DEFAULT_API_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:27888";

let API_BASE_URL = DEFAULT_API_URL;

/**
 * Initialize the API configuration by getting the sidecar port from Tauri
 * This should be called on app startup
 */
export async function initializeApiConfig(): Promise<void> {
  try {
    const port = await invoke<number | null>("get_sidecar_port");
    if (port) {
      API_BASE_URL = `http://127.0.0.1:${port}`;
      console.log(`API configured to use sidecar port: ${port}`);
    } else {
      console.warn(`Sidecar port not available yet, using default: ${DEFAULT_API_URL}`);
    }
  } catch (error) {
    console.warn(`Failed to get sidecar port, using default: ${DEFAULT_API_URL}`, error);
  }
}

/**
 * Get the current API base URL
 */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export const config = {
  get apiBaseUrl() {
    return API_BASE_URL;
  },
  get endpoints() {
    return {
      health: `${API_BASE_URL}/health`,
      score: `${API_BASE_URL}/score`,
      rate: `${API_BASE_URL}/rate`,
      decks: `${API_BASE_URL}/decks`,
      warmModel: `${API_BASE_URL}/warm-model`,
    };
  },
};

/**
 * Build a URL for a specific deck
 */
export function deckUrl(deckId: string): string {
  return `${getApiBaseUrl()}/decks/${deckId}`;
}

/**
 * Build a URL for card attempts
 */
export function cardAttemptsUrl(cardId: string): string {
  return `${getApiBaseUrl()}/cards/${cardId}/attempts`;
}

/**
 * Build a URL for bulk card operations
 */
export function deckBulkUrl(deckId: string): string {
  return `${getApiBaseUrl()}/decks/${deckId}/bulk`;
}
