import type { DisplayStep, ProgressEvent } from "@/server/live/displayTypes";
import type { ReplayStep } from "./types";

/**
 * A finished run's steps for the replay: in the order they finished, each with everything spent by
 * then. The last step ends at the run's recorded total, so the step list and the cost line agree.
 */
export function replaySteps(steps: DisplayStep[], totalUsd: number): ReplayStep[] {
  let spentUsd = 0;
  const replay = [...steps]
    .sort((a, b) => a.atMs + a.ms - (b.atMs + b.ms))
    .map((s) => {
      spentUsd += s.costUsd;
      return { atMs: s.atMs + s.ms, kind: s.kind, label: s.label, detail: s.detail, failed: s.failed, runningUsd: spentUsd };
    });
  const last = replay.at(-1);
  if (last !== undefined) last.runningUsd = totalUsd;
  return replay;
}

/**
 * A run in flight as the step list shows it: the core's progress events in the order they came, each
 * with the most any event so far reported spent. Money spent never goes back, but an event can report
 * less than one before it (one run went from $0.0116 to $0.0105), so the meter keeps the highest.
 */
export function progressSteps(events: ProgressEvent[]): ReplayStep[] {
  let highestUsd = 0;
  return events.map(({ step, spentUsd, elapsedMs }) => {
    highestUsd = Math.max(highestUsd, spentUsd);
    return { atMs: elapsedMs, kind: step.kind, label: step.label, detail: step.detail, failed: step.failed, runningUsd: highestUsd };
  });
}
