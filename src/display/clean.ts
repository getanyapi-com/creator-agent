import { CONTACT_PLACEHOLDER, stripContacts } from "../contacts.ts";
import type { GateRecord, RunOutput } from "../trace.ts";

/** Every handle the run holds: creators it read and authors of videos it saw. */
export function runHandles(run: RunOutput): Set<string> {
  return new Set([...run.evidence.creators.map((c) => c.handle), ...run.evidence.videos.map((v) => v.author)]);
}

/** What a free-text string in the display object is: the question, model-written text, a caption, an evidence excerpt, a search query. */
export type TextKind = "question" | "model" | "caption" | "excerpt" | "query";

/** How a free-text string may appear in the display object; null leaves it out. */
export type Cleaner = (kind: TextKind, raw: string) => string | null;

/** The pattern cleaner (A2a): every contact pattern becomes [removed]; links to TikTok and mentions of the run's handles stay. */
export function patternClean(raw: string, handles: ReadonlySet<string> = new Set()): string {
  return stripContacts(raw, "user", handles).clean;
}

/**
 * The pattern cleaner for one build of the display object: each distinct string is cleaned once
 * (round 4, F3), with the handles the run holds set aside so "@studio.ai" stays a mention (F2).
 */
export function onceEach(handles: ReadonlySet<string>): (raw: string) => string {
  const done = new Map<string, string>();
  return (raw) => {
    const known = done.get(raw);
    if (known !== undefined) return known;
    const clean = patternClean(raw, handles);
    done.set(raw, clean);
    return clean;
  };
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces every span the scan found, wherever it occurs, longest first. */
function removeSpans(text: string, spans: string[]): string {
  return [...spans].sort((a, b) => b.length - a.length).reduce((t, span) => t.replace(new RegExp(escape(span), "gi"), CONTACT_PLACEHOLDER), text);
}

/**
 * The gate as a cleaner (round 4, A2): the pattern cleaner first, then the scan's spans. When the scan
 * did not run or was not used, captions and evidence excerpts are left out and everything else has
 * passed the pattern cleaner only.
 */
export function gateCleaner(gate: GateRecord, handles: ReadonlySet<string>): Cleaner {
  const clean = onceEach(handles);
  return (kind, raw) => {
    const patterned = clean(raw);
    if (gate.path === "patterns") return kind === "caption" || kind === "excerpt" ? null : patterned;
    return removeSpans(patterned, gate.removed);
  };
}
