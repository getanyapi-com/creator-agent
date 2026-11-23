import type { DataClient } from "../anyapi.ts";
import type { Budget, Spender } from "../budget.ts";
import type { ContactStore } from "../contactStore.ts";
import type { EvidenceStore } from "../evidence.ts";
import type { Check } from "../finish/checks.ts";
import type { ChatModel } from "../llm.ts";
import type { ModelPrices } from "../modelCost.ts";

/** The two video models: Qwen watches a downscaled copy first; GLM the original file when Qwen fails. */
export interface VideoModels {
  primary: string;
  fallback: string;
}

/** Runs one video inspection's file work when the instance has room for it; the instance decides how many at once. */
export type VideoSlot = <R>(work: () => Promise<R>) => Promise<R>;

/** Everything a tool needs for one question. */
export interface ToolContext {
  anyapi: DataClient;
  llm: ChatModel;
  /** The question's budget, for reading what is left. */
  budget: Budget;
  /** What model calls inside a tool reserve and settle through, so each call's cost is known. */
  spend: Spender;
  store: EvidenceStore;
  contacts: ContactStore;
  nowSec: number;
  videoModels: VideoModels;
  /** Holds a video's file from its download until the watch ends (`inspect_video`). */
  videoSlot: VideoSlot;
  /** List prices of every model a run may call, so each call is bounded before it runs. */
  modelPrices: ModelPrices;
  /** Handles `inspect_creator` was asked for, so the code can list those it could not find. */
  lookedFor: Set<string>;
  /** Next-page cursors per search, so asking the same search again pages on. */
  searchCursors: Map<string, string | null>;
  /** Video ids already shown to the model, so a search returns only new rows. */
  shownVideos: Set<string>;
  /** The question's checks, fixed for the run by the intake step (round 4, F1); null when it failed. */
  questionChecks: Check[] | null;
}

export type ToolResult = Record<string, unknown>;

/** A call the budget refused; `refused` lets the step list say so in its own words. */
export function budgetError(error: string): ToolResult {
  return { error: `${error}. Call finish with what you have.`, refused: true };
}
