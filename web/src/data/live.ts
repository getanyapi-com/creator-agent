import type { DisplayRun, ProgressEvent } from "@/server/live/displayTypes";
import type { WalletStop } from "@/server/wallet/walletFetch";
import type { Tier } from "./types";

/** Where a live question stands: still researching, answered (with or without creators), or stopped by an error. */
export type LiveStatus = "running" | "done" | "failed";

/**
 * What the browser gets for a live question: its state, the core's progress events while it runs, and
 * once it is done the core's display object with the app's saved copies of its images. Never the
 * private record, a contact detail or bio text.
 */
export interface LiveRun {
  id: string;
  status: LiveStatus;
  askedAt: string;
  /** Milliseconds since the question was asked, as the server measured it when it answered. */
  elapsedMs: number;
  /** How long the research took, once it has stopped. */
  wallMs: number | null;
  /** The question as typed, given only to the account that asked it while there is no display object yet. */
  question: string | null;
  /** Why a failed run stopped, in the app's own words. */
  error: string | null;
  /** free: public, paid by the house; wallet: private to the asker, its data paid from their AnyAPI wallet. */
  tier: Tier;
  /** Why a wallet question's data calls stopped part-way, when they did. */
  walletStop: WalletStop | null;
  limitUsd: number;
  /** The core's progress events in the order they came, while the run has no display object. */
  progress: ProgressEvent[];
  display: DisplayRun | null;
  /** Saved image URLs by name: avatar-<handle> and video-<id>. */
  media: Record<string, string>;
  /** True while a finished run's images are still being saved after its answer: `media` grows until it turns false. */
  imagesPending: boolean;
}

/** Whether the thread page should ask the server again: the research is running, or its answer's images are still arriving. */
export function changesStill(run: LiveRun): boolean {
  return run.status === "running" || run.imagesPending;
}

/** What pressing Reveal gives: a note that it needs a wallet, an address, a note that the bio had none, or why to try again. */
export type RevealResult =
  | { kind: "needs-wallet" }
  | { kind: "revealed"; email: string; placeholder: boolean }
  | { kind: "none" }
  | { kind: "retry"; message: string };
