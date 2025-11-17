import type { CardSchedule } from "./deck";

export type Verdict = "incorrect" | "missing" | "almost" | "correct";

export interface ScoreRequestPayload {
  cardId: string;
  prompt: string;
  expectedAnswer: string;
  keypoints: string[];
  userAnswer: string;
  alternativeAnswers?: string[];
}

export interface AttemptRecord {
  id: string;
  cardId: string;
  userAnswer: string;
  verdict: Verdict;
  score: number;
  cosine: number;
  coverage: number;
  missingKeypoints: string[];
  feedback?: string | null;
  prompt?: string | null;
  expectedAnswer?: string | null;
  keypoints: string[];
  createdAt: string;
  schedule?: CardSchedule;
}
