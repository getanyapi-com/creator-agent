import type { Answer } from "../../src/answer.ts";
import { MemoryContactStore } from "../../src/contactStore.ts";
import { toDisplay } from "../../src/display/build.ts";
import { MemoryEvidenceStore } from "../../src/evidence.ts";
import { parseFinish, type FinishArgs } from "../../src/finish/parse.ts";
import { renderAnswer } from "../../src/finish/render.ts";
import { splitSentences } from "../../src/finish/textClaims.ts";
import { FIGURES_FAILURE, validateFinish } from "../../src/finish/validate.ts";
import { MAX_TURNS } from "../../src/prompt.ts";
import type { RunOutput } from "../../src/trace.ts";
import type { SavedRun } from "../questions.ts";
import { scanForContacts } from "./contactDetector.ts";
import { upgradeRecord } from "./legacy.ts";

export interface AutoChecks {
  idsResolve: boolean;
  figuresMatch: boolean;
  withinBudget: boolean;
  withinTurns: boolean;
  noContact: boolean;
  problems: string[];
}

/**
 * The answer's claims in the shape `finish` takes, so the same validator can re-check a saved run.
 * The criteria the code decided from the declared checks are left out; validation decides them again.
 * A direct answer the code wrote (a forced finish, or nothing confirmed, round 4 F5) is not re-checked
 * as model text: its figures are the code's own.
 */
function asFinish(a: Answer): ReturnType<typeof parseFinish> {
  return parseFinish({
    answer: a.finishedBy === "model" ? splitSentences(a.directAnswer).filter((s) => !(a.codeSentences ?? []).includes(s)).join(" ") : "",
    checks: a.checks,
    creators: a.creators.map((c) => ({
      handle: c.handle,
      proof_video_id: c.proofVideo.id,
      criteria: c.criteria.filter((k) => k.check === null).map((k) => ({ criterion: k.criterion, state: k.state, evidence_id: k.evidenceId })),
    })),
    videos: a.videos.map((v) => ({ video_id: v.id, note: v.note ?? "" })),
    patterns: a.patterns.map((p) => ({ pattern: p.pattern, video_ids: p.videoIds })),
    assumptions: a.assumptions,
    limits_note: a.limitsNote,
    sections: (a.sections ?? []).map((s) => ({ kind: s.kind, heading: s.heading, reason: s.reason ?? "", members: [...s.handles.map((h) => `@${h}`), ...s.videoIds] })),
  });
}

/**
 * Re-derives every figure on the creators and the standalone videos, and every checked criterion,
 * from the saved evidence and the answer's declared checks, and compares.
 */
function figuresEqualEvidence(o: RunOutput, store: MemoryEvidenceStore, args: FinishArgs): boolean {
  const a = o.answer;
  const again = renderAnswer({
    question: a.question,
    tier: a.tier === "free" ? { kind: "free" } : { kind: "wallet", budgetUsd: o.costs.limitUsd },
    args,
    store,
    contacts: new MemoryContactStore(),
    nowSec: o.nowSec,
    budgetNote: a.budgetNote,
    notFound: a.notFound,
    finishedBy: a.finishedBy,
    dropped: a.droppedClaims,
  });
  const figures = (x: Answer) => ({ creators: x.creators.map((c) => ({ ...c, hasPublicEmail: false })), videos: x.videos });
  return JSON.stringify(figures(again)) === JSON.stringify(figures(a));
}

/**
 * The re-validated finish with each creator's content criteria as the answer saved them: the verifier
 * may have set one to unknown after validation, so only figures and checked criteria are re-derived.
 */
function withSavedContentCriteria(kept: FinishArgs, a: Answer): FinishArgs {
  const saved = new Map(a.creators.map((c) => [c.handle, c.criteria.filter((k) => k.check === null)]));
  return {
    ...kept,
    excluded: a.excluded,
    creators: kept.creators.map((c) => ({
      ...c,
      criteria: [
        ...(saved.get(c.handle) ?? []).map((k) => ({ criterion: k.criterion, state: k.state, evidence_id: k.evidenceId, check: null })),
        ...c.criteria.filter((k) => k.check !== null),
      ],
    })),
  };
}

/**
 * Runs every automatic check on one saved run. The contact check scans the run's display object, the
 * only thing a browser may receive, with the independent detector (round 4, A4); the private record
 * is not scanned.
 */
export function autoChecks(saved: SavedRun): AutoChecks {
  if (!saved.output) {
    return { idsResolve: false, figuresMatch: false, withinBudget: true, withinTurns: false, noContact: true, problems: ["run failed"] };
  }
  const o = upgradeRecord(saved.output);
  const contacts = scanForContacts(JSON.stringify(toDisplay(o)));
  const store = MemoryEvidenceStore.fromSnapshot(o.evidence);
  const { failures, kept } = validateFinish(store, asFinish(o.answer), { nowSec: o.nowSec, notFound: o.answer.notFound });
  const figureFailures = failures.filter((f) => f.reason.startsWith(`${FIGURES_FAILURE} `));
  const idFailures = failures.filter((f) => !figureFailures.includes(f));
  const computed = figuresEqualEvidence(o, store, withSavedContentCriteria(kept, o.answer));
  const problems = [
    ...failures.map((f) => `${f.claim}: ${f.reason}`),
    ...(computed ? [] : ["a figure differs from the evidence"]),
    ...contacts.map((c) => `contact: ${c}`),
  ];
  return {
    idsResolve: idFailures.length === 0,
    figuresMatch: figureFailures.length === 0 && computed,
    withinBudget: o.costs.totalUsd <= o.costs.limitUsd + 1e-9,
    withinTurns: o.modelTurns <= MAX_TURNS,
    noContact: contacts.length === 0,
    problems,
  };
}
