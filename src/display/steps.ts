import { MAX_TURNS } from "../prompt.ts";
import type { Intake } from "../intake/intake.ts";
import type { ClosingCall, RunOutput, TraceToolCall, TraceTurn } from "../trace.ts";
import type { DisplayStep, StepKind } from "./types.ts";

/**
 * The replay's steps, worded by the code from structured facts: the tool's name, its declared
 * arguments, and the outcome kind of its result. Free text appears only as the search query, passed
 * through `clean`; tool output and service error text never appear. The same wording serves the
 * progress events of a run in flight and the display object's step list.
 */

/** A search query as it may be shown, or null to leave it out. */
export type QueryCleaner = (query: string) => string | null;
/** The author of a stored video, by id. */
export type AuthorOf = (videoId: string) => string | null;

const HANDLE = /^[a-z0-9._]{2,24}$/;
const VIDEO_URL_AUTHOR = /tiktok\.com\/@([A-Za-z0-9._]{2,24})\/video\/(\d+)/;
const MODEL_ID = /^[a-z0-9][a-z0-9.-]{0,63}$/;

export const NOT_RUN = "Not run: it would pass the limit";

type Outcome = "ok" | "refused" | "too_long" | "failed";

function outcomeOf(result: Record<string, unknown>): Outcome {
  if (result.refused === true) return "refused";
  if (result.too_long === true) return "too_long";
  return typeof result.error === "string" ? "failed" : "ok";
}

function argsOf(call: TraceToolCall): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(call.args);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function creator(handle: unknown): string {
  const h = typeof handle === "string" ? handle.trim().replace(/^@/, "").toLowerCase() : "";
  return HANDLE.test(h) ? `@${h}` : "a creator";
}

/** The creator of the video a transcript or watch call named, from the stored video or its link. */
function videoCreator(video: unknown, authorOf: AuthorOf): string {
  const raw = typeof video === "string" ? video.trim() : "";
  const fromUrl = VIDEO_URL_AUTHOR.exec(raw);
  if (fromUrl?.[1]) return creator(fromUrl[1]);
  return /^\d+$/.test(raw) ? creator(authorOf(raw)) : "a creator";
}

const count = (n: unknown, one: string, many: string): string | null =>
  typeof n === "number" && Number.isFinite(n) ? `${n.toLocaleString("en-US")} ${n === 1 ? one : many}` : null;

interface Wording {
  kind: StepKind;
  label: string;
  ok: string | null;
  failed: string;
}

function wording(call: TraceToolCall, clean: QueryCleaner, authorOf: AuthorOf): Wording {
  const args = argsOf(call);
  const r = call.result;
  switch (call.name) {
    case "search_videos": {
      const q = typeof args.query === "string" ? clean(args.query) : null;
      return { kind: "search", label: q ? `Searched "${q}"` : "Searched TikTok", ok: count(r.new_videos, "new video", "new videos"), failed: "The search did not answer" };
    }
    case "inspect_creator":
      return { kind: "creator", label: `Looked at ${creator(args.handle)}`, ok: count(r.followers, "follower", "followers"), failed: "Profile not available" };
    case "read_transcript":
      return { kind: "transcript", label: `Read the words of a video by ${videoCreator(args.video, authorOf)}`, ok: r.transcript === "no captions" ? "No captions" : null, failed: "No transcript" };
    case "inspect_video": {
      const model = typeof r.watched_by === "string" && MODEL_ID.test(r.watched_by) ? r.watched_by : null;
      const ok = model ? `Watched by ${model}${r.second_watcher === true ? " after the first watcher failed" : ""}` : null;
      return { kind: "watch", label: `Watched a video by ${videoCreator(args.video, authorOf)}`, ok, failed: "The video could not be watched" };
    }
    default:
      return { kind: "answer", label: r.accepted === true ? "Wrote the answer" : "Sent the answer back to fix its claims", ok: null, failed: "Sent the answer back to fix its claims" };
  }
}

/** One tool call as a step. */
export function toolStep(call: TraceToolCall, clean: QueryCleaner, authorOf: AuthorOf): DisplayStep {
  const w = wording(call, clean, authorOf);
  const outcome = call.name === "finish" ? "ok" : outcomeOf(call.result);
  const detail = outcome === "ok" ? w.ok : outcome === "refused" ? NOT_RUN : outcome === "too_long" ? "Too long to watch; its transcript can be read instead" : w.failed;
  const named = /@([a-z0-9._]{2,24})$/.exec(w.label)?.[1] ?? null;
  return { kind: w.kind, label: w.label, detail, failed: outcome !== "ok", handle: named, atMs: call.startedMs, ms: call.ms, costUsd: call.costUsd };
}

/** One model turn as a step. */
export function turnStep(turn: TraceTurn): DisplayStep {
  const answered = turn.model !== null;
  return {
    kind: "think",
    label: answered ? "Planned the next steps" : "The model did not answer",
    detail: `Turn ${turn.turn} of ${MAX_TURNS}`,
    failed: !answered,
    handle: null,
    atMs: turn.startedMs,
    ms: turn.ms,
    costUsd: turn.costUsd,
  };
}

/** Every turn and tool call of a trace, in the order they started. */
export function traceSteps(trace: TraceTurn[], clean: QueryCleaner, authorOf: AuthorOf): DisplayStep[] {
  return trace.flatMap((t) => [turnStep(t), ...t.toolCalls.map((c) => toolStep(c, clean, authorOf))]);
}

function closingStep(call: ClosingCall, label: string, failedDetail: string): DisplayStep {
  return { kind: "check", label, detail: call.ok ? null : failedDetail, failed: !call.ok, handle: null, atMs: call.startedMs, ms: call.ms, costUsd: call.costUsd };
}

/** The verifier's step, once it has run. */
export function verifyStep(call: ClosingCall): DisplayStep {
  return closingStep(call, "Checked the answer against the evidence", "The check did not run; unchecked claims are shown as unknown");
}

/** The contact scan's step, once it has run. */
export function gateStep(call: ClosingCall): DisplayStep {
  return closingStep(call, "Checked the text for contact details", "The check did not run; captions and excerpts are left out");
}

/** The intake step (round 4, F1), once it has run: how many of the question's limits the code read. */
export function intakeStep(intake: Intake): DisplayStep {
  const call = intake.call ?? { startedMs: 0, ms: 0, costUsd: 0, ok: false };
  const n = intake.checks.length;
  const detail = intake.status === "failed" ? "Could not read them; the agent's own reading is used" : n === 0 ? "The question states none" : count(n, "limit", "limits");
  return { kind: "check", label: "Read the limits the question states", detail, failed: intake.status === "failed", handle: null, atMs: call.startedMs, ms: call.ms, costUsd: call.costUsd };
}

/** The steps before the research: the intake step, when it ran. */
export function openingSteps(run: RunOutput): DisplayStep[] {
  return run.intake.call ? [intakeStep(run.intake)] : [];
}

/** The run's last step when nothing the agent wrote could be confirmed (round 4, F5). */
export function unconfirmedStep(atMs: number): DisplayStep {
  return { kind: "answer", label: "Nothing it found could be confirmed", detail: "No answer to show", failed: true, handle: null, atMs, ms: 0, costUsd: 0 };
}

/** The closing calls of a finished run, as steps, and the failure when nothing was confirmed. */
export function closingSteps(run: RunOutput): DisplayStep[] {
  return [
    ...(run.verify ? [verifyStep(run.verify)] : []),
    ...(run.gate.call ? [gateStep(run.gate.call)] : []),
    ...(run.answer.finishedBy === "unconfirmed" ? [unconfirmedStep(run.wallMs)] : []),
  ];
}
