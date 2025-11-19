/**
 * API Service
 * Handles all HTTP communication with the Retention backend server
 */

import { config, deckUrl, cardAttemptsUrl, deckBulkUrl } from "../config/api";
import type { GradingMode } from "../types/deck";

// Types (matching the backend models)
export interface ApiHealth {
  status: string;
  database?: string;
  modelCache?: string;
  modelCacheMessage?: string | null;
}

export interface DeckCardSummary {
  id: string;
  prompt: string;
  keypointCount: number;
  answer?: string | null;
  keypoints?: string[] | null;
  archived?: boolean | null;
  gradingMode?: GradingMode | null;
}

export interface DeckMetadata {
  id: string;
  title: string;
  description?: string | null;
  cardCount: number;
  updatedAt: string;
  cards: DeckCardSummary[];
}

export interface DeckCardInput {
  id?: string | null;
  prompt: string;
  answer: string;
  keypoints?: string[];
  archived?: boolean | null;
  gradingMode?: GradingMode | null;
}

export interface DeckCreatePayload {
  id?: string | null;
  title: string;
  description?: string | null;
  cards?: DeckCardInput[];
}

export interface DeckUpdatePayload {
  title?: string | null;
  description?: string | null;
  cards?: DeckCardInput[] | null;
}

export type BulkOperationType = "mark-learned" | "archive" | "unarchive";

export interface BulkCardOperation {
  cardIds: string[];
  operation: BulkOperationType;
}

export interface ScoreRequest {
  cardId: string;
  prompt: string;
  expectedAnswer: string;
  keypoints?: string[];
  userAnswer: string;
  alternativeAnswers?: string[];
}

export interface AttemptRecord {
  id: string;
  cardId: string;
  userAnswer: string;
  verdict: string;
  score: number;
  cosine: number;
  coverage: number;
  missingKeypoints?: string[];
  feedback?: string | null;
  prompt?: string | null;
  expectedAnswer?: string | null;
  keypoints?: string[];
  createdAt: string;
}

/**
 * API Client class
 */
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = config.apiBaseUrl) {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic fetch wrapper with error handling and timeout
   */
  private async request<T>(
    url: string,
    options?: RequestInit,
    timeoutMs: number = 30000 // 30 second default timeout
  ): Promise<T> {
    // Security: Add timeout to prevent indefinite hangs
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        throw error;
      }
      throw new Error(`Request failed: ${String(error)}`);
    }
  }

  /**
   * Health check
   */
  async checkHealth(): Promise<ApiHealth> {
    return this.request<ApiHealth>(config.endpoints.health);
  }

  /**
   * List all decks
   */
  async listDecks(): Promise<DeckMetadata[]> {
    return this.request<DeckMetadata[]>(config.endpoints.decks);
  }

  /**
   * Create a new deck
   */
  async createDeck(payload: DeckCreatePayload): Promise<DeckMetadata> {
    return this.request<DeckMetadata>(config.endpoints.decks, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Update a deck
   */
  async updateDeck(deckId: string, payload: DeckUpdatePayload): Promise<DeckMetadata> {
    return this.request<DeckMetadata>(deckUrl(deckId), {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Delete a deck
   */
  async deleteDeck(deckId: string): Promise<void> {
    return this.request<void>(deckUrl(deckId), {
      method: "DELETE",
    });
  }

  /**
   * Score an answer
   */
  async scoreAnswer(payload: ScoreRequest): Promise<AttemptRecord> {
    return this.request<AttemptRecord>(config.endpoints.score, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Self-rate a card (Quick Mode)
   */
  async rateCard(payload: RateRequest): Promise<RateResponse> {
    return this.request<RateResponse>(config.endpoints.rate, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * List attempts for a card
   */
  async listAttempts(cardId: string, limit: number = 50): Promise<AttemptRecord[]> {
    const url = `${cardAttemptsUrl(cardId)}?limit=${limit}`;
    return this.request<AttemptRecord[]>(url);
  }

  /**
   * Bulk update cards
   */
  async bulkUpdateCards(deckId: string, operation: BulkCardOperation): Promise<DeckMetadata> {
    return this.request<DeckMetadata>(deckBulkUrl(deckId), {
      method: "POST",
      body: JSON.stringify(operation),
    });
  }

  /**
   * Warm up the model cache
   */
  async warmModel(): Promise<ApiHealth> {
    return this.request<ApiHealth>(config.endpoints.warmModel, {
      method: "POST",
    });
  }
}

// Export a singleton instance
export const api = new ApiClient();

// Export the class for testing
export { ApiClient };
