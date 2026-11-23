import { CHECK_KINDS, type Check, type CheckKind } from "../finish/checks.ts";
import { daysValue, followerValue, viewsValue, wantedValue } from "./quoteValues.ts";
import { regionValue } from "./region.ts";

/** A proposal the code refused, with why, for the private record. */
export interface Rejected {
  proposal: string;
  why: string;
}

export interface Accepted {
  /** Each limit the question states, confirmed by its quote; all `from: "question"`. */
  checks: Check[];
  /** How many creators the question asks for, when it says a number. */
  wanted: number | null;
  /** How many checks the model proposed, accepted or not. */
  proposed: number;
  rejected: Rejected[];
}

type Raw = Record<string, unknown>;

/** Lowercased, NFKC, whitespace collapsed: how a quote is found in the question. */
function plain(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** The value the code reads from a quote for a kind of check. */
function valueFor(kind: CheckKind, quote: string): number | string | null {
  switch (kind) {
    case "followers_at_most":
      return followerValue(quote, "at_most");
    case "followers_at_least":
      return followerValue(quote, "at_least");
    case "proof_views_at_least":
      return viewsValue(quote);
    case "proof_posted_within_days":
      return daysValue(quote);
    case "proof_region":
      return regionValue(quote);
  }
}

/** The proposed value as the code compares it: a number, or an upper-case country code. */
function proposedValue(kind: CheckKind, value: unknown): number | string | null {
  if (kind === "proof_region") return typeof value === "string" && /^[A-Za-z]{2}$/.test(value.trim()) ? value.trim().toUpperCase() : null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Why a quote does not license its proposal, or null when it does. */
function quoteProblem(question: string, quote: unknown): string | null {
  if (typeof quote !== "string" || !quote.trim()) return "no quote from the question";
  return plain(question).includes(plain(quote)) ? null : "the quote is not in the question";
}

function describe(r: Raw): string {
  return JSON.stringify({ kind: r.kind, value: r.value, quote: r.quote }).slice(0, 200);
}

/**
 * Accepts each proposed check only when its quote occurs in the question and the value the code
 * reads from that quote equals the proposed one (round 4, F1). "10K" and "10,000" are the same
 * number; a country name maps to its code. "Around N" reads as no value, so it is never a limit.
 * At most one check per kind.
 */
export function acceptProposals(question: string, reply: Raw): Accepted {
  const checks: Check[] = [];
  const rejected: Rejected[] = [];
  const proposals = Array.isArray(reply.checks) ? reply.checks : [];
  for (const item of proposals) {
    const r: Raw = typeof item === "object" && item !== null ? (item as Raw) : {};
    const reject = (why: string): void => void rejected.push({ proposal: describe(r), why });
    const kind = CHECK_KINDS.find((k) => k === r.kind);
    if (!kind) {
      reject("not a kind of check");
      continue;
    }
    const problem = quoteProblem(question, r.quote);
    const proposed = proposedValue(kind, r.value);
    const read = problem ? null : valueFor(kind, String(r.quote));
    if (problem) reject(problem);
    else if (proposed === null) reject("no usable value");
    else if (read === null) reject("the quote states no single value of this kind");
    else if (read !== proposed) reject(`the quote says ${read}, not ${proposed}`);
    else if (checks.some((c) => c.kind === kind)) reject("a second check of this kind");
    else checks.push({ kind, value: proposed, from: "question" });
  }
  return { checks, wanted: acceptWanted(question, reply.wanted, rejected), proposed: proposals.length, rejected };
}

function acceptWanted(question: string, raw: unknown, rejected: Rejected[]): number | null {
  if (raw === null || raw === undefined) return null;
  const r: Raw = typeof raw === "object" ? (raw as Raw) : {};
  const value = typeof r.value === "number" && Number.isInteger(r.value) && r.value > 0 ? r.value : null;
  const problem = quoteProblem(question, r.quote) ?? (value === null ? "no usable value" : wantedValue(String(r.quote)) !== value ? "the quote does not say this number" : null);
  if (problem) {
    rejected.push({ proposal: `wanted ${describe(r)}`, why: problem });
    return null;
  }
  return value;
}
