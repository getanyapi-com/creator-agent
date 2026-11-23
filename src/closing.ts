import type { DroppedClaim } from "./answer.ts";
import type { EvidenceStore } from "./evidence.ts";
import { verifyNarrative } from "./finish/narrative.ts";
import { withCodeSentences } from "./finish/fallbacks.ts";
import type { FinishArgs } from "./finish/parse.ts";
import { subjectContext } from "./finish/subjects.ts";
import { verifyClaims, type Verifier, type VerifierCall } from "./finish/verify.ts";
import { MODEL_MAX_TOKENS } from "./limits.ts";
import { textBoundUsd, type ModelPrices } from "./modelCost.ts";
import type { ClosingCall } from "./trace.ts";

/**
 * The largest request each closing call was measured to send, in bytes, over the 208 saved agent runs
 * in bench/out on 2026-11-21 (`pnpm bench closing-sizes`; medians 25,467, 29,496 and 6,057), with the
 * requests as round 5 builds them: each claim and sentence beside the evidence of the creator or video
 * it is about. Every byte is counted as a token, as for every text call. An observed maximum, not a
 * guarantee: a larger request at close is still bounded before it runs and refused if it does not fit.
 * A second try at a reply that could not be read (`askReadable`) is not held: it runs only if the
 * question's money left can reserve it.
 */
export const CLAIMS_REQUEST_BYTES = 105_410;
export const NARRATIVE_REQUEST_BYTES = 103_021;
export const SCAN_REQUEST_BYTES = 12_561;

/**
 * The money held back from the start for the three closing calls (round 4, B5): each at its largest
 * measured request and its full output allowance. No data or agent call may use it.
 *
 * Their output allowance and time limit are the agent's (4,000 tokens, 180 s): replayed live on GLM
 * on 2026-11-21 (`pnpm bench closing-live`, 35 calls over round 3's pass 04-44-40-395Z, every reply
 * readable), the most output was 1,242 tokens (reasoning included) and the slowest call 23.7 s; in
 * round 5's 540 replayed claim and sentence checks (`pnpm bench closing-replay`) the most was 3,223
 * tokens and no reply ran out of room.
 */
export function closingHoldUsd(prices: ModelPrices, verifierModel: string, scanModel: string): number {
  return (
    textBoundUsd(prices, verifierModel, CLAIMS_REQUEST_BYTES, MODEL_MAX_TOKENS) +
    textBoundUsd(prices, verifierModel, NARRATIVE_REQUEST_BYTES, MODEL_MAX_TOKENS) +
    textBoundUsd(prices, scanModel, SCAN_REQUEST_BYTES, MODEL_MAX_TOKENS)
  );
}

/** Two calls that ran side by side, as one closing step: from the first start to the last end. */
function together(calls: (VerifierCall | null)[], startedMs: number): ClosingCall | null {
  const ran = calls.filter((c): c is VerifierCall => c !== null);
  if (ran.length === 0) return null;
  return { startedMs, ms: Math.max(...ran.map((c) => c.ms)), costUsd: ran.reduce((s, c) => s + c.costUsd, 0), ok: ran.every((c) => c.ok) };
}

/**
 * Has the verifier read an accepted finish: its content claims, and its answer, notes and assumptions
 * sentence by sentence. The two calls are independent and run in parallel (round 4, C1), on the money
 * held for closing.
 */
export async function verifyFinish(v: Verifier, store: EvidenceStore, args: FinishArgs, question: string, nowSec: number, startedMs: number): Promise<{ kept: FinishArgs; notes: DroppedClaim[]; call: ClosingCall | null }> {
  const ctx = subjectContext(store, args, nowSec, question);
  const [claims, narrative] = await Promise.all([verifyClaims(v, ctx, args), verifyNarrative(v, ctx, args, question)]);
  const verified: FinishArgs = {
    ...claims.kept,
    answer: narrative.kept.answer,
    videos: narrative.kept.videos,
    assumptions: narrative.kept.assumptions,
    limits_note: narrative.kept.limits_note,
    sections: narrative.kept.sections,
    labels: { ...args.labels, ...narrative.labels },
  };
  const kept = withCodeSentences(args, verified, store, question);
  return { kept, notes: [...claims.notes, ...narrative.notes], call: together([claims.call, narrative.call], startedMs) };
}
