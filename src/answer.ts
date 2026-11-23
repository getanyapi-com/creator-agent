import type { Excluded } from "./finish/applyChecks.ts";
import type { SentenceLabel } from "./display/types.ts";
import type { Check } from "./finish/checks.ts";
import type { AnswerSection } from "./finish/sections.ts";

/** The answer object a run returns. Every figure in it is computed by the code from evidence rows. */
export type CriterionState = "supported" | "contradicted" | "unknown";

export interface Criterion {
  criterion: string;
  state: CriterionState;
  evidenceId: string | null;
  /** Set when the code decided the state itself from one of the answer's declared checks. */
  check: Check | null;
}

export interface AnswerVideo {
  id: string;
  url: string;
  creator: string;
  views: number | null;
  likes: number | null;
  postedUtc: number | null;
  daysAgo: number | null;
  videoRegion: string | null;
  paidLabel: boolean | null;
  note: string | null;
  /** The cover image link from TikTok's CDN; it expires within hours. Never sent to a model. */
  image?: string;
}

export interface AnswerCreator {
  handle: string;
  profileUrl: string;
  /** The profile picture link from TikTok's CDN; it expires within hours. Never sent to a model. */
  avatarUrl?: string;
  followers: number | null;
  usualViews: number | null;
  postsSampled: number;
  bestRecentVideoId: string | null;
  bestRecentViews: number | null;
  proofVsUsualRatio: number | null;
  postsPerWeek: number | null;
  paidLabelShare: number | null;
  hasPublicEmail: boolean;
  proofVideo: AnswerVideo;
  criteria: Criterion[];
}

export interface AnswerPattern {
  pattern: string;
  videoIds: string[];
}

export interface DroppedClaim {
  claim: string;
  reason: string;
}

export type Tier = { kind: "free" } | { kind: "wallet"; budgetUsd: number };

export interface Answer {
  question: string;
  tier: Tier["kind"];
  directAnswer: string;
  /** The checks applied by the code to every creator, declared once for the answer. */
  checks: Check[];
  /** Those checks in plain words with their figures, and what they left out; written by the code. */
  criteriaLine: string | null;
  excluded: Excluded;
  creators: AnswerCreator[];
  videos: AnswerVideo[];
  patterns: AnswerPattern[];
  /** The answer in reading order: the best fit, groups that share a reason, patterns (round 4, E1). */
  sections: AnswerSection[];
  assumptions: string[];
  limitsNote: string;
  /** Handles the agent looked for and could not find, listed by the code. */
  notFound: string[];
  budgetNote: string | null;
  /** model: the agent's answer; forced: the code's, when the agent did not finish; unconfirmed: nothing the agent wrote could be confirmed (round 4, F5). */
  finishedBy: "model" | "forced" | "unconfirmed";
  droppedClaims: DroppedClaim[];
  /** Each sentence of the direct answer, video notes and assumptions, by what kind of statement it is. */
  sentenceLabels: Record<string, SentenceLabel>;
  /** Sentences of the direct answer the code wrote after the closing check cut the answer (round 5); absent on runs saved before. */
  codeSentences?: string[];
}
