/**
 * API Configuration
 * Centralized configuration for backend API endpoints
 */

// Get the backend URL from environment variable or use default (sidecar listens on 127.0.0.1:27888)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:27888";

export const config = {
  apiBaseUrl: API_BASE_URL,
  endpoints: {
    health: `${API_BASE_URL}/health`,
    score: `${API_BASE_URL}/score`,
    rate: `${API_BASE_URL}/rate`,
    decks: `${API_BASE_URL}/decks`,
    warmModel: `${API_BASE_URL}/warm-model`,
  },
} as const;

/**
 * Build a URL for a specific deck
 */
export function deckUrl(deckId: string): string {
  return `${API_BASE_URL}/decks/${deckId}`;
}

/**
 * Build a URL for card attempts
 */
export function cardAttemptsUrl(cardId: string): string {
  return `${API_BASE_URL}/cards/${cardId}/attempts`;
}

/**
 * Build a URL for bulk card operations
 */
export function deckBulkUrl(deckId: string): string {
  return `${API_BASE_URL}/decks/${deckId}/bulk`;
}

// Export the base URL for convenience
export { API_BASE_URL };
