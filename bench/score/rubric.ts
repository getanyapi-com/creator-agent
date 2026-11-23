import type { SavedRun, Question } from "../questions.ts";
import type { AutoChecks } from "./checks.ts";
import type { JudgeVerdict } from "./judge.ts";

/**
 * Targets for questions that name no number. Assumptions, open to change: 10 creators is what the
 * dev questions that name a number ask for; "a few" hook patterns is read as 3; one video to explain.
 */
const DEFAULT_CREATORS = 10;
const DEFAULT_PATTERNS = 3;

export interface Score {
  questionId: string;
  finished: string;
  creators: number;
  checks: AutoChecks;
  judged: boolean;
  /** Creators the judge found fit the brief ("yes"), and those that fit in part. */
  fits: number;
  partly: number;
  validResults: number | null;
  criterionAccuracy: number | null;
  claimSupport: number | null;
  statesUncertainty: boolean;
  /** Why the run fails outright; empty when it does not. */
  fails: string[];
  failedOutright: boolean;
  costUsd: number;
  wallSec: number;
  judgeNotes: string;
}

function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

/** Valid results against the number asked for; an empty answer scores zero unless it should be empty. */
function validResults(q: Question, v: JudgeVerdict): number {
  if (q.results === "explanation") return v.answersQuestion ? 1 : 0;
  if (q.unanswerable) return v.answersQuestion && v.statesPoorFit ? 1 : 0;
  if (q.results === "patterns") return Math.min(1, v.patterns.filter((p) => p.supported).length / (q.wanted ?? DEFAULT_PATTERNS));
  return Math.min(1, v.creators.filter((c) => c.fit === "yes").length / (q.wanted ?? DEFAULT_CREATORS));
}

/**
 * The judge-based reasons a run fails outright (round 2 contract, Part B): padding with off-topic
 * creators; fewer results than the question asked for without saying so; creators returned for a
 * question that cannot be answered well, without saying that.
 */
function judgedFails(q: Question, saved: SavedRun, v: JudgeVerdict): string[] {
  const fails: string[] = [];
  const off = v.creators.filter((c) => c.fit === "no").map((c) => `@${c.handle}`);
  if (off.length) fails.push(`padded with ${off.join(", ")}`);
  const fits = v.creators.filter((c) => c.fit === "yes").length;
  const explained = v.explainsShortfall || Boolean(saved.output?.answer.budgetNote);
  if (q.results === "creators" && !q.unanswerable && q.wanted !== null && fits < q.wanted && !explained) fails.push(`short: ${fits} of ${q.wanted} asked, not explained`);
  if (q.unanswerable && v.creators.length > 0 && !v.statesPoorFit) fails.push("creators returned without saying the question cannot be answered well");
  return fails;
}

export function score(q: Question, saved: SavedRun, checks: AutoChecks, verdict: JudgeVerdict | null): Score {
  const o = saved.output;
  const criteria = verdict?.creators.flatMap((c) => c.criteria) ?? [];
  const fails = [
    ...(o === null ? ["run failed"] : []),
    ...(checks.withinBudget ? [] : ["over budget"]),
    ...(checks.figuresMatch ? [] : ["figure not from evidence"]),
    ...(checks.noContact ? [] : ["contact detail"]),
    ...(verdict ? judgedFails(q, saved, verdict) : []),
  ];
  return {
    questionId: q.id,
    finished: o ? o.answer.finishedBy : "error",
    creators: o?.answer.creators.length ?? 0,
    checks,
    judged: verdict !== null,
    fits: verdict?.creators.filter((c) => c.fit === "yes").length ?? 0,
    partly: verdict?.creators.filter((c) => c.fit === "partly").length ?? 0,
    validResults: fails.length ? 0 : verdict ? validResults(q, verdict) : null,
    criterionAccuracy: ratio(criteria.filter((k) => k.right).length, criteria.length),
    claimSupport: ratio(verdict?.patterns.filter((p) => p.supported).length ?? 0, verdict?.patterns.length ?? 0),
    statesUncertainty: verdict?.statesPoorFit ?? false,
    fails,
    failedOutright: fails.length > 0,
    costUsd: o?.costs.totalUsd ?? 0,
    wallSec: (o?.wallMs ?? 0) / 1000,
    judgeNotes: verdict?.notes ?? "",
  };
}
