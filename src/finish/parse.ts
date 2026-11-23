import type { CriterionState } from "../answer.ts";
import type { SentenceLabel } from "../display/types.ts";
import { NONE_EXCLUDED, type Excluded } from "./applyChecks.ts";
import { parseChecks, type Check } from "./checks.ts";
import { parseSections, type FinishSection } from "./sections.ts";

/** What the model passes to `finish`, normalized so validation never meets a wrong type. */
export interface FinishCriterion {
  criterion: string;
  state: CriterionState;
  evidence_id: string | null;
  /** Set only by the code, on the criteria it decides from a declared check. */
  check: Check | null;
}

export interface FinishCreator {
  handle: string;
  proof_video_id: string;
  criteria: FinishCriterion[];
}

export interface FinishArgs {
  answer: string;
  /** Declared once for the answer; the code applies each to every creator. */
  checks: Check[];
  /** code: the question's checks were read by the intake step and fixed; agent: as the agent declared them (round 4, F1). */
  checksReadBy: "code" | "agent";
  /** Why each check the model declared and the code could not read was refused. */
  checkProblems: string[];
  creators: FinishCreator[];
  videos: { video_id: string; note: string }[];
  patterns: { pattern: string; video_ids: string[] }[];
  /** The answer in reading order, written by the model (round 4, E1); the code settles members at render. */
  sections: FinishSection[];
  assumptions: string[];
  limits_note: string;
  /** Filled by validation: the creators the question's checks left out. */
  excluded: Excluded;
  /** Filled by the narrative check: each kept sentence of the answer, notes and assumptions, by what kind of statement it is. */
  labels: Record<string, SentenceLabel>;
  /** Sentences of `answer` the code wrote after the closing check (round 5); never model text. */
  codeSentences: string[];
}

type Raw = Record<string, unknown>;
const STATES: CriterionState[] = ["supported", "contradicted", "unknown"];

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function list(value: unknown): Raw[] {
  return Array.isArray(value) ? value.filter((v): v is Raw => typeof v === "object" && v !== null) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function criterion(raw: Raw): FinishCriterion {
  const state = text(raw.state).toLowerCase() as CriterionState;
  return {
    criterion: text(raw.criterion),
    state: STATES.includes(state) ? state : "unknown",
    evidence_id: text(raw.evidence_id) || null,
    check: null,
  };
}

export function parseFinish(raw: Raw): FinishArgs {
  const { checks, problems } = parseChecks(raw.checks);
  return {
    answer: text(raw.answer),
    checks,
    checksReadBy: "agent",
    checkProblems: problems,
    creators: list(raw.creators).map((c) => ({
      handle: text(c.handle).replace(/^@/, "").toLowerCase(),
      proof_video_id: text(c.proof_video_id),
      criteria: list(c.criteria).map(criterion),
    })),
    videos: list(raw.videos).map((v) => ({ video_id: text(v.video_id), note: text(v.note) })),
    patterns: list(raw.patterns).map((p) => ({ pattern: text(p.pattern), video_ids: strings(p.video_ids) })),
    sections: parseSections(raw.sections),
    assumptions: strings(raw.assumptions),
    limits_note: text(raw.limits_note),
    excluded: NONE_EXCLUDED,
    labels: {},
    codeSentences: [],
  };
}

/** A finish with no answer text and no creator, video or pattern: rejected like any failed finish (round 4, B6). */
export function isEmptyFinish(args: FinishArgs): boolean {
  return args.answer === "" && args.creators.length === 0 && args.videos.length === 0 && args.patterns.length === 0;
}
