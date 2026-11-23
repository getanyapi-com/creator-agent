import type { Answer } from "./answer.ts";
import type { CallLog } from "./anyapi.ts";
import type { StoredContact } from "./contactStore.ts";
import type { EvidenceSnapshot } from "./evidence.ts";
import type { Fetch } from "./evidenceIndex.ts";
import type { Intake } from "./intake/intake.ts";
import type { ToolResult } from "./tools/context.ts";

export interface TraceToolCall {
  name: string;
  /** The arguments as parsed into the tool's declared fields (round 4, A3). */
  args: string;
  result: ToolResult;
  /** When the call started, in milliseconds since the run began, and how long it took. */
  startedMs: number;
  ms: number;
  /** What the call cost the question: its data calls and any model call inside it. */
  costUsd: number;
  /** The evidence ids this call put in the store, as the answer cites them. */
  fetched: string[];
}

/** One model turn: what the model said and every tool it called, with what came back. */
export interface TraceTurn {
  turn: number;
  model: string | null;
  startedMs: number;
  ms: number;
  costUsd: number;
  finishReason: string | null;
  attempts: string[];
  content: string;
  toolCalls: TraceToolCall[];
  note: string | null;
}

export interface Costs {
  limitUsd: number;
  dataUsd: number;
  modelUsd: number;
  totalUsd: number;
  /** Billed above a hold and not taken from the question's money (Qwen's output, round 4 B3). */
  houseUsd: number;
  dataCalls: number;
  refusedCalls: number;
}

/** One closing model call (the verifier or the contact scan), as the step list shows it. */
export interface ClosingCall {
  startedMs: number;
  ms: number;
  costUsd: number;
  /** False when it could not run, was refused, or its reply could not be read. */
  ok: boolean;
}

/**
 * The contact gate's verdict on the display object (round 4, A2). `model`: the scan ran and every
 * span in `removed` is replaced with [removed]; `patterns`: it did not, so captions and evidence
 * excerpts are left out and model-written text has passed the pattern cleaner only.
 */
export interface GateRecord {
  path: "model" | "patterns";
  /** Why the scan did not run or its reply was not used, in the code's own words; null when it was used. */
  reason: string | null;
  removed: string[];
  call: ClosingCall | null;
}

/**
 * The private record of one run: everything as fetched, for debugging and for the server only. A
 * browser never receives it; `toDisplay` builds what a browser may receive.
 */
export interface RunOutput {
  answer: Answer;
  evidence: EvidenceSnapshot;
  trace: TraceTurn[];
  /** Each evidence id to the turn and tool call that fetched it. */
  evidenceIndex: Record<string, Fetch[]>;
  costs: Costs;
  calls: CallLog[];
  wallMs: number;
  /** The clock every "days ago" in this run was computed against. */
  nowSec: number;
  modelTurns: number;
  contactsFound: number;
  /** Contact details found in TikTok text, by creator, with where each was found. Never displayed. */
  contacts: Record<string, StoredContact[]>;
  verify: ClosingCall | null;
  /** The question's checks as the intake step read them, and the proposals it refused (round 4, F1). */
  intake: Intake;
  gate: GateRecord;
}
