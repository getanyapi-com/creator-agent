import type { LiveStatus } from "./live";
import type { SentenceLabel, StepKind } from "@/server/live/displayTypes";
import type { WalletStop } from "@/server/wallet/walletFetch";

export type { SentenceLabel, StepKind } from "@/server/live/displayTypes";

/** The view model the pages render. The adapter builds it from the core's display object, and nothing else. */
export type Tier = "free" | "wallet";
export type CriterionState = "supported" | "unknown" | "contradicted";

export interface VideoView {
  id: string;
  url: string;
  creator: string;
  views: number | null;
  postedUtc: number | null;
  region: string | null;
  paidLabel: boolean | null;
  caption: string | null;
  /** True when the core's contact check did not run and left the caption out; the post on TikTok has it. */
  captionOnTikTok: boolean;
  /** A local copy of the video's cover, when one was saved for the fixture. */
  thumbnailUrl?: string;
}

export interface CriterionView {
  text: string;
  state: CriterionState;
  evidenceId: string | null;
}

export interface CreatorView {
  handle: string;
  profileUrl: string;
  /** A local copy of the creator's avatar, when one was saved for the fixture. */
  avatarUrl?: string;
  followers: number | null;
  usualViews: number | null;
  postsSampled: number | null;
  postsPerWeek: number | null;
  proofVsUsualRatio: number | null;
  hasPublicEmail: boolean;
  proof: VideoView | null;
  criteria: CriterionView[];
  /** For a close creator only: the one limit of the question it misses and its measured value, written by the core's code. */
  missed?: string;
}

export interface PatternView {
  text: string;
  videos: VideoView[];
}

/** `best`: the single best fit; `group`: creators that share a reason; `pattern`: videos that show a pattern. */
export type SectionKind = "best" | "group" | "pattern";

/** One step of the answer as it should be read: a heading, why, and who or what it is about, in order. */
export interface SectionView {
  kind: SectionKind;
  heading: string;
  /** One or two sentences; null when the core built the section or its check dropped the reason. */
  reason: string | null;
  /** The creators in this section, in order. Every creator in the answer is in exactly one `best` or `group` section. */
  creators: CreatorView[];
  /** A pattern's videos, in order; empty for a creator section, whose creators carry their proof videos. */
  videos: VideoView[];
}

/** What a criterion was decided from: a short excerpt and the TikTok page it is on. */
export interface EvidenceView {
  kind: "video" | "creator" | "transcript" | "watch";
  url: string;
  /** Null for a creator's profile (the bio is read on TikTok), for a check the code decided, and when the contact check did not run. */
  excerpt: string | null;
}

export interface ReplayStep {
  /** When the step finished, in recorded milliseconds from the start of the run. */
  atMs: number;
  kind: StepKind;
  label: string;
  detail: string | null;
  failed: boolean;
  /** Everything spent up to and including this step, in USD. */
  runningUsd: number;
}

export interface CostView {
  limitUsd: number | null;
  totalUsd: number;
  /** Unknown for a run that stopped before the core reported its costs. */
  dataCalls: number | null;
  modelTurns: number;
  wallMs: number | null;
}

export interface AnswerSentence {
  text: string;
  label: SentenceLabel;
}

export interface ThreadView {
  id: string;
  question: string;
  tier: Tier;
  /** Why a wallet question's data calls stopped part-way, when they did; the answer holds what was found before. */
  walletStop: WalletStop | null;
  askedAt: string | null;
  /** model: the agent's answer; forced: the code's, when the agent did not finish; unconfirmed: nothing the agent found could be confirmed. */
  finishedBy: "model" | "forced" | "unconfirmed" | null;
  /** The direct answer, sentence by sentence, each labelled as the core labelled it. */
  answer: AnswerSentence[];
  /** The checks applied to every creator and how many they left out, in plain words written by the core's code. */
  criteriaLine: string | null;
  creators: CreatorView[];
  /** The answer in reading order, as the core wrote it: the best fit, groups that share a reason, patterns. Empty when there are no creators. */
  sections: SectionView[];
  /** Creators on the question's topic outside exactly one of its limits, shown after the sections; null when there are none. */
  close: SectionView | null;
  patterns: PatternView[];
  assumptions: string[];
  /** What limited the answer, sentence by sentence, each labelled as the core labelled it. */
  limits: AnswerSentence[];
  budgetNote: string | null;
  notFound: string[];
  cost: CostView;
  steps: ReplayStep[];
  evidence: Record<string, EvidenceView>;
}

/** A creator as the front page shows them: who, their face, and the cover of the video that proves it. */
export interface FeedCreator {
  handle: string;
  /** A local copy of the creator's avatar, when one was saved for the fixture. */
  avatarUrl?: string;
  /** A local copy of the proof video's cover, when one was saved for the fixture. */
  proofThumbnailUrl?: string;
}

export interface FeedItem {
  id: string;
  question: string;
  askedAt: string | null;
  creatorCount: number;
  totalUsd: number;
  /** Every creator in the answer, in its order; the front page decides how many to show. */
  creators: FeedCreator[];
}

/** One of the signed-in account's own questions on the front page: whether only they can see it, and where it stands. */
export interface OwnFeedItem extends FeedItem {
  private: boolean;
  status: LiveStatus;
}
