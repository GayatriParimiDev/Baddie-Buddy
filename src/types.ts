export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  targetBand: number; // e.g. 7.5
  currentBand: number; // e.g. 6.5
  xp: number;
  streak: number;
  lastPracticeDate: string | null;
  totalHours: number;
  sessionsCompleted: number;
}

export interface PracticeQuestion {
  id: string;
  topic: string;
  partType: 1 | 2 | 3; // Part 1, 2, or 3
  question: string;
  cueCardSubQuestions?: string[]; // Specifically for Part 2 cue cards
  difficulty: "easy" | "medium" | "hard";
  category: string;
  keywords: string[];
}

import { Timestamp } from "firebase/firestore";

export interface SpeakingCorrection {
  original: string;
  correction: string;
  explanation: string;
}

export interface PronunciationDetails {
  intonationScore: number;
  stressScore: number;
  clarityScore: number;
  phonemeErrors: string[];
  targetedExercises: string[];
  overallFeedback: string;
}

export interface SpeakingSessionResult {
  id: string;
  userId: string;
  sessionType: "mock_test" | "practice";
  agent: "examiner" | "partner";
  topic: string;
  promptQuestion: string;
  transcript: string;
  overallBand: number;
  fluencyBand: number;
  vocabularyBand: number;
  grammarBand: number;
  pronunciationBand: number;
  pronunciationDetails?: PronunciationDetails; // Rich phonetic diagnostic details
  strengths: string[];
  weaknesses: string[];
  corrections: SpeakingCorrection[];
  actionPlan: string[];
  examinerCommentary: string;
  coachFeedback: string;
  fillerWordsCount: number;
  createdAt: string; // ISO String
}
