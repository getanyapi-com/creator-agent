import type { DisplayStep, ProgressEvent } from "./displayTypes";

/**
 * A live run's progress as a browser may receive it. Progress comes before the core's final contact
 * gate, so each step is relabelled here from its kind, plus the creator's handle (checked by the core);
 * the core's label and detail, which can carry a search query, never leave the server. The search words
 * appear only in the finished display object, whose steps have passed the gate.
 */

/**
 * One kind covers several steps: "check" is the reading of the question's limits, the check of the answer
 * against the evidence and the scan for contact details; "answer" is an answer accepted, one sent back, and
 * the end where nothing could be confirmed. The core words these from code alone (`src/display/steps.ts`),
 * so they are told apart by its label, matched whole: a label not listed here is never shown. Each is shown
 * as it went, since a check that could not run keeps its label in the core and says so only in its detail.
 */
const FIXED = new Map<string, { ok: string; failed: string }>([
  ["Read the limits the question states", { ok: "Read the limits the question states", failed: "Could not read the question's limits" }],
  ["Checked the answer against the evidence", { ok: "Checked the answer against the evidence", failed: "Could not check the answer against the evidence" }],
  ["Checked the text for contact details", { ok: "Checked the text for contact details", failed: "Could not check the text for contact details" }],
  ["Wrote the answer", { ok: "Wrote the answer", failed: "Wrote the answer" }],
  ["Sent the answer back to fix its claims", { ok: "Sent the answer back to fix its claims", failed: "Sent the answer back to fix its claims" }],
  ["Nothing it found could be confirmed", { ok: "Nothing it found could be confirmed", failed: "Nothing it found could be confirmed" }],
]);

/** What a step of these kinds is called should the core word one in a way not listed above. */
const UNLISTED: Record<"check" | "answer", string> = { check: "Ran a check", answer: "Worked on the answer" };

function label(step: DisplayStep): string {
  const { kind, handle, failed } = step;
  const by = handle === null ? "" : ` by @${handle}`;
  switch (kind) {
    case "search":
      return "Searched TikTok";
    case "creator":
      return handle === null ? "Looked at a creator" : `Looked at @${handle}`;
    case "transcript":
      return `Read a transcript${by}`;
    case "watch":
      return `Watched a video${by}`;
    case "think":
      return failed ? "The model did not answer" : "Planned the next steps";
    case "answer":
    case "check": {
      const fixed = FIXED.get(step.label);
      return fixed === undefined ? UNLISTED[kind] : failed ? fixed.failed : fixed.ok;
    }
  }
}

function liveStep(step: DisplayStep): DisplayStep {
  return { ...step, label: label(step), detail: null };
}

export function liveProgress(events: ProgressEvent[]): ProgressEvent[] {
  return events.map((event) => ({ ...event, step: liveStep(event.step) }));
}
