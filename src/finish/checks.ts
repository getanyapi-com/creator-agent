import type { CriterionState } from "../answer.ts";
import type { EvidenceStore } from "../evidence.ts";
import { daysAgo } from "../metrics.ts";

export const CHECK_KINDS = ["followers_at_most", "followers_at_least", "proof_views_at_least", "proof_posted_within_days", "proof_region"] as const;

export type CheckKind = (typeof CHECK_KINDS)[number];

/** Where a check came from: the question, or an assumption the agent made and states. */
export const CHECK_SOURCES = ["question", "assumption"] as const;

export type CheckSource = (typeof CHECK_SOURCES)[number];

/**
 * A criterion the code decides from evidence on every creator of the answer. The model declares it
 * once per answer, with the value from the question or its stated assumption.
 */
export interface Check {
  kind: CheckKind;
  value: number | string;
  from: CheckSource;
}

export interface Decided {
  criterion: string;
  state: CriterionState;
  evidence_id: string;
  /** The measured value the check was decided on: a count, days ago, or a country code; null when unknown. */
  actual: number | string | null;
}

const SCALE: Record<string, number> = { k: 1e3, m: 1e6 };

function count(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const match = typeof value === "string" ? /^\s*(\d+(?:\.\d+)?)\s*([kKmM])?\s*$/.exec(value.replace(/,/g, "")) : null;
  if (!match?.[1]) return null;
  return Number(match[1]) * (SCALE[(match[2] ?? "").toLowerCase()] ?? 1);
}

/** Reads one declared check; a string says why it could not be read. */
export function parseCheck(raw: unknown): Check | string {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const kind = CHECK_KINDS.find((k) => k === r.kind);
  if (!kind) return `check kind must be one of ${CHECK_KINDS.join(", ")}`;
  const from = CHECK_SOURCES.find((s) => s === r.from);
  if (!from) return `the ${kind} check must say whether it is from the question or an assumption`;
  if (kind === "proof_region") {
    const region = typeof r.value === "string" ? r.value.trim().toUpperCase() : "";
    return /^[A-Z]{2}$/.test(region) ? { kind, value: region, from } : "a proof_region check needs a two-letter country code";
  }
  const n = count(r.value);
  return n === null ? `a ${kind} check needs a number` : { kind, value: n, from };
}

/** Reads the answer's checks: at most one per kind, so one threshold applies to every creator. */
export function parseChecks(raw: unknown): { checks: Check[]; problems: string[] } {
  const checks: Check[] = [];
  const problems: string[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const check = parseCheck(item);
    if (typeof check === "string") problems.push(check);
    else if (checks.some((c) => c.kind === check.kind)) problems.push(`declare the ${check.kind} check once; it applies to every creator`);
    else checks.push(check);
  }
  return { checks, problems };
}

const fmt = (n: number): string => n.toLocaleString("en-US");
const REGIONS = new Intl.DisplayNames(["en"], { type: "region" });

/** A two-letter country code as the page names the country. */
export const regionName = (code: string): string => REGIONS.of(code) ?? code;

/** The check in plain words with its figure, as the answer's criteria line and each creator's criterion show it. */
export function checkLabel(check: Check): string {
  const v = check.value;
  switch (check.kind) {
    case "followers_at_most":
      return `at most ${fmt(Number(v))} followers`;
    case "followers_at_least":
      return `at least ${fmt(Number(v))} followers`;
    case "proof_views_at_least":
      return `proof video at least ${fmt(Number(v))} views`;
    case "proof_posted_within_days":
      return `proof video posted in the last ${fmt(Number(v))} days`;
    case "proof_region":
      return `proof video region ${regionName(String(v))}`;
  }
}

function compare(actual: number | null, ok: (a: number) => boolean): CriterionState {
  if (actual === null) return "unknown";
  return ok(actual) ? "supported" : "contradicted";
}

/**
 * Decides a check from evidence. A missing field is unknown, never zero: followers come only from an
 * inspected profile, and a profile read that gave no count leaves them unknown.
 */
export function decideCheck(store: EvidenceStore, handle: string, proofVideoId: string, check: Check, nowSec: number): Decided {
  const followers = store.getCreator(handle)?.followers ?? null;
  const proof = store.getVideo(proofVideoId);
  const v = Number(check.value);
  const on = (evidence_id: string, actual: number | null, ok: (a: number) => boolean): Decided => ({ criterion: checkLabel(check), state: compare(actual, ok), evidence_id, actual });
  switch (check.kind) {
    case "followers_at_most":
      return on(`@${handle}`, followers, (a) => a <= v);
    case "followers_at_least":
      return on(`@${handle}`, followers, (a) => a >= v);
    case "proof_views_at_least":
      return on(proofVideoId, proof?.views ?? null, (a) => a >= v);
    case "proof_posted_within_days":
      return on(proofVideoId, daysAgo(proof?.createdUtc ?? null, nowSec), (a) => a <= v);
    case "proof_region": {
      const region = proof?.region ? proof.region.toUpperCase() : null;
      return { criterion: checkLabel(check), state: region === null ? "unknown" : region === check.value ? "supported" : "contradicted", evidence_id: proofVideoId, actual: region };
    }
  }
}
