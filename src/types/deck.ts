export type DeckId = string;

export interface CardSchedule {
  dueAt: string;
  interval: number;
  ease: number;
  streak: number;
  quality?: number | null;
}

export type GradingMode = "lenient" | "strict" | "keywords" | "hybrid";

export interface CardSummary {
  id: string;
  prompt: string;
  keypointCount: number;
  answer?: string;
  keypoints?: string[];
  schedule?: CardSchedule;
  archived?: boolean;
  gradingMode?: GradingMode;
  alternativeAnswers?: string[];
}

export interface Deck {
  id: DeckId;
  title: string;
  description?: string;
  cardCount: number;
  updatedAt: string;
  cards: CardSummary[];
}

export interface CardPayload {
  id?: string;
  prompt: string;
  answer: string;
  keypoints: string[];
  schedule?: CardSchedule | null;
  archived?: boolean;
  gradingMode?: GradingMode;
  alternativeAnswers?: string[];
}

export interface DeckPayload {
  id?: DeckId;
  title: string;
  description?: string;
  cards?: CardPayload[];
}

export interface DeckUpdatePayload {
  title?: string;
  description?: string;
  cards?: CardPayload[];
}

export interface BulkCardOperation {
  cardIds: string[];
  operation: 'mark-learned' | 'reset-schedule' | 'archive' | 'unarchive';
}
