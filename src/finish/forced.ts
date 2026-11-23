import type { EvidenceStore } from "../evidence.ts";
import { creatorFigures } from "../metrics.ts";
import { applyChecks } from "./applyChecks.ts";
import type { Check } from "./checks.ts";
import type { FinishArgs } from "./parse.ts";
import { splitSentences } from "./textClaims.ts";

/**
 * The finish the code writes when the model did not finish in its turns: the creators it inspected,
 * each with its best sampled post as proof. Only the question's own checks (round 4, F1) are applied;
 * nothing else is judged against the question. `reason` is one of the code's own fixed messages,
 * never a service's error text.
 */
export function forcedFinish(store: EvidenceStore, reason: string, nowSec: number, questionChecks: Check[] | null): FinishArgs {
  const inspected = store
    .snapshot()
    .creators.map((c) => ({ handle: c.handle, best: creatorFigures(store, c).best }))
    .filter((c) => c.best !== null)
    .sort((a, b) => (b.best?.views ?? 0) - (a.best?.views ?? 0))
    .map((c) => ({ handle: c.handle, proof_video_id: c.best?.id ?? "", criteria: [] }));
  const checks = questionChecks ?? [];
  const { creators, excluded } = applyChecks(store, inspected, checks, nowSec);
  const checked = checks.length ? "checked only against the limits the question states" : "none was checked against the question";
  const answer = `The research ended before the agent wrote an answer (${reason}). These are the creators it inspected, ${checked}, so treat them as leads, not results.`;
  return {
    answer,
    checks,
    checksReadBy: questionChecks ? "code" : "agent",
    checkProblems: [],
    creators,
    closeNamed: [],
    close: [],
    excluded,
    videos: [],
    patterns: [],
    sections: [],
    assumptions: [],
    limits_note: "",
    labels: Object.fromEntries(splitSentences(answer).map((t) => [t, "limit" as const])),
    codeSentences: [],
  };
}
