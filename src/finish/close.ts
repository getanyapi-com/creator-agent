import type { DroppedClaim } from "../answer.ts";
import type { EvidenceStore } from "../evidence.ts";
import { checkLabel, decideCheck, regionName, type Check, type Decided } from "./checks.ts";
import { resolveEvidence } from "./evidenceRef.ts";
import type { FinishCreator, FinishCriterion } from "./parse.ts";

/**
 * Close matches (2026-11-22): when the answer has fewer creators than the question asked for, the
 * creators the run already looked at who are on the question's topic but outside exactly one of its
 * limits. The agent names them; the code decides the one miss and writes its label; the verifier
 * confirms the topic. None is ever an exact creator.
 */

/** A creator the agent names as close. */
export interface FinishClose {
  handle: string;
  proof_video_id: string;
  /** The text that shows the topic; the proof video's caption when the agent names none. */
  evidence_id: string | null;
}

/** A close creator the code admitted: the code's checks and the topic as its criteria, and the one limit it misses. */
export interface CloseCreator extends FinishCreator {
  /** The text the topic claim cites. */
  evidence_id: string;
  /** The limit missed and the measured value against it, written by the code. */
  missed: string;
}

/** The criterion a close creator shows for its topic; the code writes it and the verifier confirms it. */
export const TOPIC_CRITERION = "On the topic the question asks about";

/** The claim the verifier reads for each close creator: the question's topic, its limits left to the code. */
export function topicClaim(question: string): string {
  return `Leaving aside follower counts, views, how recently and where a video was posted (the code checks those separately), the cited evidence shows this creator posted about what this question asks for: "${question}"`;
}

/** Whether the answer shows close creators: fewer exact creators than the question asked for, or none when it named no number. */
export function closeShown(exact: number, wanted: number | null): boolean {
  return wanted === null ? exact === 0 : exact < wanted;
}

const fmt = (n: number): string => n.toLocaleString("en-US");

function measured(check: Check, actual: number | string): string {
  switch (check.kind) {
    case "followers_at_most":
    case "followers_at_least":
      return `${fmt(Number(actual))} followers`;
    case "proof_views_at_least":
      return `proof video ${fmt(Number(actual))} views`;
    case "proof_posted_within_days":
      return `proof video posted ${Number(actual) === 1 ? "1 day" : `${fmt(Number(actual))} days`} ago`;
    case "proof_region":
      return `proof video region ${regionName(String(actual))}`;
  }
}

/** The limit missed, worded as the criteria line words it, with the measured value against it. */
export function missLabel(check: Check, decided: Decided): string {
  return `${measured(check, decided.actual ?? "")}, asked for ${checkLabel(check)}`;
}

/**
 * How far outside the limit it misses the measured value is, relative to the limit: the same value
 * and limit the miss label is written from. Null when the check has no distance (a region).
 */
function missDistance(check: Check, decided: Decided): number | null {
  const a = Number(decided.actual);
  const v = Number(check.value);
  switch (check.kind) {
    case "followers_at_most":
    case "proof_posted_within_days":
      return (a - v) / v;
    case "followers_at_least":
    case "proof_views_at_least":
      return (v - a) / v;
    case "proof_region":
      return null;
  }
}

/** Nearest first; a miss with no distance after every miss with one. */
function nearer(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface CloseFacts {
  store: EvidenceStore;
  checks: Check[];
  nowSec: number;
  /** The answer's exact creators, who are never close. */
  exact: Set<string>;
}

type Admitted = { ok: true; creator: CloseCreator; distance: number | null } | { ok: false; reason: string };

function admit(f: CloseFacts, c: FinishClose): Admitted {
  const proof = f.store.getVideo(c.proof_video_id);
  if (!proof) return { ok: false, reason: `proof video ${c.proof_video_id || "(none)"} is not in the evidence` };
  if (proof.author !== c.handle) return { ok: false, reason: `proof video ${proof.id} is by @${proof.author}` };
  const evidenceId = c.evidence_id ?? c.proof_video_id;
  const ref = resolveEvidence(f.store, evidenceId);
  if (!ref || ref.author !== c.handle || !ref.text) return { ok: false, reason: `evidence ${evidenceId} is not text of this creator's` };
  const decided = f.checks.map((check) => ({ check, d: decideCheck(f.store, c.handle, c.proof_video_id, check, f.nowSec) }));
  const asked = decided.filter((x) => x.check.from === "question");
  const unknown = asked.find((x) => x.d.state === "unknown");
  if (unknown) return { ok: false, reason: `"${checkLabel(unknown.check)}" could not be decided` };
  const misses = asked.filter((x) => x.d.state === "contradicted");
  const miss = misses[0];
  if (misses.length !== 1 || !miss) return { ok: false, reason: `it misses ${misses.length} of the question's limits, not exactly one` };
  const criteria: FinishCriterion[] = [
    { criterion: TOPIC_CRITERION, state: "supported", evidence_id: evidenceId, check: null },
    ...decided.map((x) => ({ criterion: x.d.criterion, state: x.d.state, evidence_id: x.d.evidence_id, check: x.check })),
  ];
  return { ok: true, creator: { handle: c.handle, proof_video_id: c.proof_video_id, evidence_id: evidenceId, criteria, missed: missLabel(miss.check, miss.d) }, distance: missDistance(miss.check, miss.d) };
}

/**
 * The close creators the code admits from the agent's nominations, nearest to the limit it misses
 * first and otherwise in the agent's order (see missDistance): each misses exactly one
 * of the question's limits and meets every other one with a decided value (an assumption is not a
 * limit to be close to), has a proof video of its own, and cites text of its own for the topic. The
 * rest are listed with why, for the private record only: a refused nomination never fails a finish.
 */
export function admitClose(f: CloseFacts, nominated: FinishClose[]): { close: CloseCreator[]; notes: DroppedClaim[] } {
  const close: { creator: CloseCreator; distance: number | null }[] = [];
  const notes: DroppedClaim[] = [];
  const seen = new Set<string>();
  for (const c of nominated) {
    if (f.exact.has(c.handle) || seen.has(c.handle)) continue;
    seen.add(c.handle);
    const done = admit(f, c);
    if (done.ok) close.push(done);
    else notes.push({ claim: `close @${c.handle}`, reason: `not shown as close: ${done.reason}` });
  }
  close.sort((a, b) => nearer(a.distance, b.distance));
  return { close: close.map((c) => c.creator), notes };
}
