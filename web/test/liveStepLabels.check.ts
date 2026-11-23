import { expect, test } from "vitest";
import { liveProgress } from "@/server/live/liveSteps";
import type { DisplayStep } from "@/server/live/displayTypes";
import { gateStep, intakeStep, toolStep, turnStep, unconfirmedStep, verifyStep } from "../../src/display/steps.ts";
import type { TraceToolCall } from "../../src/trace.ts";

const call = { startedMs: 0, ms: 1, costUsd: 0, ok: true };
const tool = (name: string, args: object, result: Record<string, unknown>): TraceToolCall => ({ name, args: JSON.stringify(args), result, startedMs: 0, ms: 1, costUsd: 0, fetched: [] });
const keep = (q: string) => q;
const author = () => "potter";

/** What the browser shows for a step the core built. */
const shown = (s: DisplayStep): string => liveProgress([{ step: s, spentUsd: 0, limitUsd: 0.1, elapsedMs: 0 }])[0]!.step.label;

// The first user test (2026-11-22): six seconds in, the reading of the question's limits showed as "Checked the answer",
// and every answer step as "Wrote the answer", sent back or not.
test("each step the core builds gets a live label that is true of it, with no search words", () => {
  const cases: [DisplayStep, string][] = [
    [intakeStep({ status: "read", checks: [], wanted: null, rejected: [], call }), "Read the limits the question states"],
    [intakeStep({ status: "failed", checks: [], wanted: null, rejected: [], call: { ...call, ok: false } }), "Could not read the question's limits"],
    [turnStep({ turn: 1, model: "m", startedMs: 0, ms: 1, costUsd: 0, finishReason: null, attempts: [], content: "", toolCalls: [], note: null }), "Planned the next steps"],
    [turnStep({ turn: 1, model: null, startedMs: 0, ms: 1, costUsd: 0, finishReason: null, attempts: [], content: "", toolCalls: [], note: null }), "The model did not answer"],
    [toolStep(tool("search_videos", { query: "pottery wheel" }, { new_videos: 3 }), keep, author), "Searched TikTok"],
    [toolStep(tool("inspect_creator", { handle: "potter" }, { followers: 10 }), keep, author), "Looked at @potter"],
    [toolStep(tool("read_transcript", { video: "123" }, {}), keep, author), "Read a transcript by @potter"],
    [toolStep(tool("inspect_video", { video: "123" }, {}), keep, author), "Watched a video by @potter"],
    [toolStep(tool("finish", {}, { accepted: true }), keep, author), "Wrote the answer"],
    [toolStep(tool("finish", {}, { accepted: false, failed_claims: [] }), keep, author), "Sent the answer back to fix its claims"],
    [verifyStep(call), "Checked the answer against the evidence"],
    [verifyStep({ ...call, ok: false }), "Could not check the answer against the evidence"],
    [gateStep(call), "Checked the text for contact details"],
    [gateStep({ ...call, ok: false }), "Could not check the text for contact details"],
    [unconfirmedStep(0), "Nothing it found could be confirmed"],
  ];
  expect(cases.map(([s]) => shown(s))).toEqual(cases.map(([, label]) => label));
});

test("a check or answer step worded in a way the web does not list shows a plain label, never the core's words", () => {
  const base = { detail: null, failed: false, handle: null, atMs: 0, ms: 1, costUsd: 0 };
  expect(shown({ ...base, kind: "check", label: "Checked something new" })).toBe("Ran a check");
  expect(shown({ ...base, kind: "answer", label: "Searched \"pottery wheel\"" })).toBe("Worked on the answer");
});
