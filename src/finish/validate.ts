import type { DroppedClaim } from "../answer.ts";
import type { EvidenceStore } from "../evidence.ts";
import { applyChecks } from "./applyChecks.ts";
import { admitClose, closeShown, type FinishClose } from "./close.ts";
import { evidenceText } from "./evidenceText.ts";
import { resolveEvidence } from "./evidenceRef.ts";
import type { FinishArgs, FinishCreator, FinishCriterion } from "./parse.ts";
import { keepSupportedSentences, splitSentences, textProblems, type TextRules } from "./textClaims.ts";

/** The start of every failure about a figure, so checks can tell those apart. */
export const FIGURES_FAILURE = "figures";

/** What the run knows besides evidence: its clock, the handles it looked for and did not find, and how many creators the question asked for. */
export interface RunFacts {
  nowSec: number;
  notFound: string[];
  wanted: number | null;
}

export interface Validation {
  failures: DroppedClaim[];
  /** Close nominations the code did not admit, with why; never a reason to send the finish back. */
  notes: DroppedClaim[];
  /** The same finish with every failed claim removed and every checked criterion decided by the code. */
  kept: FinishArgs;
}

type Fail = (claim: string, reason: string) => false;

/** Checks each claim in a finish against the evidence store; claims that fail are listed and removed. */
export function validateFinish(store: EvidenceStore, args: FinishArgs, run: RunFacts): Validation {
  const failures: DroppedClaim[] = [];
  const fail: Fail = (claim, reason) => {
    failures.push({ claim, reason });
    return false;
  };
  args.checkProblems.forEach((p) => fail("checks", p));
  const seen = new Set<string>();
  const creators = args.creators
    .filter((c) => checkCreator(store, c, seen, fail))
    .map((c) => ({ ...c, criteria: c.criteria.flatMap((k) => criterionOrNothing(store, c, k, fail)) }));
  const videos = args.videos.filter(
    (v) => store.getVideo(v.video_id) !== undefined || fail(`video ${v.video_id}`, "this video id is not in the evidence"),
  );
  const patterns = args.patterns.filter((p) => {
    const known = new Set(p.video_ids.filter((id) => store.getVideo(id)));
    return known.size >= 2 || fail(`pattern "${p.pattern}"`, "a pattern must cite at least two video ids from the evidence");
  });
  const snapshot = store.snapshot();
  const notFound = new Set(run.notFound);
  const rules: TextRules = {
    handles: new Set([...snapshot.videos.map((v) => v.author), ...snapshot.creators.map((c) => c.handle)].filter((h) => !notFound.has(h))),
    evidenceText: evidenceText(snapshot),
  };
  const textCheck = (label: string, text: string): string => {
    const { figures, handles } = textProblems(text, rules);
    if (figures.length) fail(label, `${FIGURES_FAILURE} ${figures.join(", ")} are not allowed; write no numbers or number words, the code adds every figure`);
    if (handles.length) fail(label, `creators ${handles.join(", ")} are not in the evidence; name only creators you saw (the code lists those not found)`);
    return figures.length || handles.length ? keepSupportedSentences(text, rules) : text;
  };
  const written = creators.map((c) => ({
    ...c,
    criteria: c.criteria.map((k) => ({ ...k, criterion: textCheck(`@${c.handle} criterion`, k.criterion) })).filter((k) => k.criterion),
  }));
  const checked = applyChecks(store, written, args.checks, run.nowSec);
  const closeFound = closeShown(checked.creators.length, run.wanted)
    ? admitClose({ store, checks: args.checks, nowSec: run.nowSec, exact: new Set(checked.creators.map((c) => c.handle)) }, [...checked.oneMiss.map(nominated), ...args.closeNamed])
    : { close: [], notes: [] };
  const sections = args.sections.map((s, i) => ({ ...s, heading: textCheck(`section ${i + 1} heading`, s.heading), reason: textCheck(`section ${i + 1} reason`, s.reason) }));
  const answer = withoutCreatorList(textCheck("answer", args.answer), checked.creators.map((c) => c.handle), fail);
  const kept: FinishArgs = {
    answer,
    checks: args.checks,
    checksReadBy: args.checksReadBy,
    checkProblems: [],
    creators: checked.creators,
    closeNamed: [],
    close: closeFound.close,
    excluded: checked.excluded,
    videos: videos.map((v) => ({ ...v, note: textCheck(`video ${v.video_id} note`, v.note) })),
    patterns: patterns.map((p) => ({ ...p, pattern: textCheck("pattern", p.pattern) })).filter((p) => p.pattern),
    sections,
    assumptions: args.assumptions.map((a) => textCheck("assumption", a)).filter(Boolean),
    limits_note: textCheck("limits_note", args.limits_note),
    labels: args.labels,
    codeSentences: args.codeSentences,
  };
  return { failures, notes: closeFound.notes, kept };
}

/** A creator the checks removed for one miss, nominated as close with the first content claim it was given as its topic. */
function nominated(c: FinishCreator): FinishClose {
  const topic = c.criteria.find((k) => !k.check && k.state === "supported" && k.evidence_id);
  return { handle: c.handle, proof_video_id: c.proof_video_id, evidence_id: topic?.evidence_id ?? null };
}

/**
 * The direct answer is the summary above the sections, which the display object always has when
 * there are creators, so it must not repeat the list of handles (round 4, E2): a sentence naming two
 * or more of the answer's creators is dropped.
 */
function withoutCreatorList(answer: string, handles: string[], fail: Fail): string {
  const names = (s: string): number => handles.filter((h) => new RegExp(`@${h.replace(/\./g, "\\.")}(?!\\w|\\.\\w)`, "i").test(s)).length;
  const kept = splitSentences(answer).filter((s) => names(s) < 2 || fail(`answer sentence "${s}"`, "it lists creators; the sections show them, so the answer is a summary"));
  return kept.join(" ");
}

function checkCreator(store: EvidenceStore, c: FinishCreator, seen: Set<string>, fail: Fail): boolean {
  const label = `@${c.handle}`;
  if (seen.has(c.handle)) return fail(label, "listed twice");
  seen.add(c.handle);
  const proof = store.getVideo(c.proof_video_id);
  if (!proof) return fail(label, `proof video ${c.proof_video_id || "(none)"} is not in the evidence`);
  if (proof.author !== c.handle) return fail(label, `proof video ${proof.id} is by @${proof.author}, not ${label}`);
  return true;
}

/**
 * A criterion the model writes is about content. A supported or contradicted one must cite text that
 * exists and belongs to the creator: a caption, a non-empty transcript, a watched video's
 * observations, or a bio. Whether that text shows the claim is the verifier's call, later. Size,
 * views, recency and region are the answer's declared checks, applied by the code.
 */
function criterionOrNothing(store: EvidenceStore, c: FinishCreator, k: FinishCriterion, fail: Fail): FinishCriterion[] {
  const label = `@${c.handle} "${k.criterion}"`;
  if (!k.criterion) return fail(label, "criterion text is empty") || [];
  if (k.state === "unknown") return [{ ...k, evidence_id: null }];
  if (!k.evidence_id) return fail(label, `a ${k.state} criterion needs an evidence id`) || [];
  const ref = resolveEvidence(store, k.evidence_id);
  if (!ref) return fail(label, `evidence ${k.evidence_id} is not in the evidence store`) || [];
  if (ref.author !== c.handle) return fail(label, `evidence ${k.evidence_id} belongs to @${ref.author}, not @${c.handle}`) || [];
  if (!ref.text) return fail(label, `evidence ${k.evidence_id} holds no text that could show this; cite a caption, transcript, watched video or bio, declare a check, or mark it unknown`) || [];
  return [k];
}
