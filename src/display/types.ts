import type { CriterionState } from "../answer.ts";

/**
 * The display object (round 4, A1): the only thing a web server may send to a browser or publish.
 * The code builds it from a finished run's private record. Every free-text string in it has passed
 * the contact gate (A2); every other field is a code-computed fact or a link the code builds. It
 * holds no bio text and no contact detail; `hasPublicEmail` says whether a Reveal has an email.
 */
export interface DisplayRun {
  question: string;
  /** The direct answer, sentence by sentence, each labelled by what kind of statement it is. */
  answer: DisplaySentence[];
  /** The checks applied to every creator, in plain words with their figures; written by the code. */
  criteriaLine: string | null;
  excluded: { count: number; byCheck: { check: string; count: number }[] };
  creators: DisplayCreator[];
  videos: DisplayVideo[];
  patterns: DisplayPattern[];
  /**
   * The answer in reading order (round 4, E2): the single best fit, then groups of creators that share
   * a reason, then patterns whose members are videos. Every creator of `creators` is in exactly one
   * best or group section, with the same code-computed fields.
   */
  sections: DisplaySection[];
  assumptions: string[];
  limits: string | null;
  /** The limits note sentence by sentence, each labelled; verified like the answer (round 4, F4). */
  limitsSentences: DisplaySentence[];
  /** Handles the agent looked for and could not find. */
  notFound: string[];
  /** Why the research stopped early because of the budget, in plain words; written by the code. */
  budgetNote: string | null;
  /** model: the agent's answer; forced: the code's, when the agent did not finish; unconfirmed: nothing the agent wrote could be confirmed (round 4, F5). */
  finishedBy: "model" | "forced" | "unconfirmed";
  /** The replay: what the research did, in the code's own words. */
  steps: DisplayStep[];
  cost: DisplayCost;
  /** Which contact gate ran: the model scan, or only the pattern cleaner (captions and excerpts then omitted). */
  gate: "model" | "patterns";
}

/**
 * fact: shown by the evidence; limit: about what could not be checked or was not found;
 * assumption: an assumption the answer states; other: no fact about a creator or video.
 */
export type SentenceLabel = "fact" | "limit" | "assumption" | "other";

export interface DisplaySentence {
  text: string;
  label: SentenceLabel;
}

export interface DisplayCreator {
  handle: string;
  profileUrl: string;
  avatarUrl: string | null;
  followers: number | null;
  usualViews: number | null;
  postsSampled: number;
  bestRecentViews: number | null;
  proofVsUsualRatio: number | null;
  postsPerWeek: number | null;
  paidLabelShare: number | null;
  /** True when an email was found in the creator's public bio; a Reveal returns it. */
  hasPublicEmail: boolean;
  proofVideo: DisplayVideo;
  criteria: DisplayCriterion[];
}

export interface DisplayVideo {
  id: string;
  url: string;
  creator: string;
  views: number | null;
  likes: number | null;
  postedUtc: number | null;
  daysAgo: number | null;
  region: string | null;
  paidLabel: boolean | null;
  /** The caption, gated; null when the gate fell back to patterns only (link to `url` instead). */
  caption: string | null;
  note: DisplaySentence[];
  imageUrl: string | null;
}

export interface DisplayCriterion {
  text: string;
  state: CriterionState;
  /** check: decided by the code from a declared check; claim: written by the agent and verified. */
  source: "check" | "claim";
  evidence: DisplayEvidence | null;
}

export interface DisplayEvidence {
  kind: "video" | "creator" | "transcript" | "watch";
  /** The TikTok page the evidence is on: the video, or the creator's profile for a bio. */
  url: string;
  /** A short excerpt of the evidence text; null for a bio, or when the gate fell back to patterns only. */
  excerpt: string | null;
}

export interface DisplaySection {
  kind: "best" | "group" | "pattern";
  heading: string;
  /** One or two sentences; null when the code built the section or its reason was not shown by the evidence. */
  reason: string | null;
  creators: DisplayCreator[];
  /** The pattern's videos; empty for a creator section, whose creators carry their proof videos. */
  videos: DisplayVideo[];
  /** The ids of `videos`, for a reader that wants ids only. */
  videoIds: string[];
}

export interface DisplayPattern {
  text: string;
  videoIds: string[];
}

export type StepKind = "search" | "creator" | "transcript" | "watch" | "think" | "answer" | "check";

/** One thing the research did, worded by the code from structured facts, never from tool output. */
export interface DisplayStep {
  kind: StepKind;
  label: string;
  /** A short code-written outcome ("12 new videos", "Not run: it would pass the limit"), or null. */
  detail: string | null;
  failed: boolean;
  /** The creator the step is about, when it names one (the handle in the label, checked by the code). */
  handle: string | null;
  /** When it started, in milliseconds since the run began, and how long it took. */
  atMs: number;
  ms: number;
  costUsd: number;
}

export interface DisplayCost {
  limitUsd: number;
  dataUsd: number;
  modelUsd: number;
  totalUsd: number;
  dataCalls: number;
  modelTurns: number;
  wallMs: number;
}

/** What `runAgent` reports while a run is in flight: one per tool call and per model turn. */
export interface ProgressEvent {
  step: DisplayStep;
  /** Spent so far against the limit, data and model cost together. */
  spentUsd: number;
  limitUsd: number;
  elapsedMs: number;
}

/** A creator's contact details for a Reveal, read from the private record. */
export interface RevealedContact {
  handle: string;
  /** The email found in the creator's public bio or profile link, or null when there is none. */
  email: string | null;
}
