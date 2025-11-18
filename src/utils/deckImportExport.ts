/**
 * Shared utilities for deck import/export functionality.
 * These functions are used by both App.tsx and DeckDetails.tsx.
 */

import type { Deck } from "../types/deck";

/**
 * Normalizes a deck title into a safe filename.
 * Converts to lowercase, replaces non-alphanumeric characters with hyphens,
 * and removes leading/trailing hyphens.
 *
 * @param title - The deck title to normalize
 * @returns A safe filename (without extension)
 *
 * @example
 * normalizeFilename("My Cool Deck!") // "my-cool-deck"
 * normalizeFilename("  ") // "deck"
 */
export function normalizeFilename(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (base.length > 0 ? base : "deck") + ".json";
}

/**
 * Creates a JSON export payload for a deck.
 * Includes version metadata and timestamp for compatibility tracking.
 *
 * @param deck - The deck to export
 * @returns JSON string with pretty formatting (2-space indentation)
 */
export function createDeckExportPayload(deck: Deck): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      deck: {
        id: deck.id,
        title: deck.title,
        description: deck.description ?? "",
        cards: deck.cards.map((card) => ({
          id: card.id,
          prompt: card.prompt,
          answer: card.answer ?? "",
          keypoints: card.keypoints ?? [],
          schedule: card.schedule ?? null,
          alternativeAnswers: card.alternativeAnswers ?? []
        }))
      }
    },
    null,
    2
  );
}
