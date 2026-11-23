import type { EvidenceStore } from "../evidence.ts";
import { checkLabel, decideCheck, type Check } from "./checks.ts";
import type { FinishCreator } from "./parse.ts";

/** Creators the code left out because they contradict a check taken from the question. */
export interface Excluded {
  count: number;
  /** How many of them contradict each check; one creator can contradict several. */
  byCheck: { check: string; count: number }[];
}

export const NONE_EXCLUDED: Excluded = { count: 0, byCheck: [] };

/**
 * Applies every declared check to every creator. A creator who contradicts a check from the question
 * is removed and counted; one who contradicts an assumed check stays, shown as contradicted. Unknown
 * stays unknown and stays in. Each creator's checked criteria are written by the code after its own.
 */
export function applyChecks(store: EvidenceStore, creators: FinishCreator[], checks: Check[], nowSec: number): { creators: FinishCreator[]; excluded: Excluded } {
  const kept: FinishCreator[] = [];
  const counts = new Map<Check, number>();
  let count = 0;
  for (const c of creators) {
    const decided = checks.map((check) => ({ check, ...decideCheck(store, c.handle, c.proof_video_id, check, nowSec) }));
    const failed = decided.filter((d) => d.check.from === "question" && d.state === "contradicted");
    if (failed.length) {
      count += 1;
      failed.forEach((d) => counts.set(d.check, (counts.get(d.check) ?? 0) + 1));
      continue;
    }
    const coded = decided.map((d) => ({ criterion: d.criterion, state: d.state, evidence_id: d.evidence_id, check: d.check }));
    kept.push({ ...c, criteria: [...c.criteria, ...coded] });
  }
  const byCheck = checks.filter((c) => counts.has(c)).map((c) => ({ check: checkLabel(c), count: counts.get(c) ?? 0 }));
  return { creators: kept, excluded: { count, byCheck } };
}
