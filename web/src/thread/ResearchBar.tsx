"use client";

import { useState } from "react";
import { LiveNote } from "@/components/LiveNote";
import type { CostView, ReplayStep } from "@/data/types";
import { formatDuration, formatUsd, plural } from "@/lib/format";
import type { Replay } from "@/lib/useReplay";
import { StepList } from "@/thread/StepList";

/** While running, the newest steps; this many keeps the bar a fixed, short height. */
const LIVE_STEPS = 3;

interface Props {
  steps: readonly ReplayStep[];
  cost: CostView;
  replay: Replay;
}

/** The research as a bar: money spent against the limit, the newest steps while it runs, the full list on request after. */
export function ResearchBar({ steps, cost, replay }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = steps.slice(0, replay.shown);
  const spent = replay.done ? cost.totalUsd : (visible.at(-1)?.runningUsd ?? 0);
  const share = cost.limitUsd === null || cost.limitUsd === 0 ? null : Math.min(1, spent / cost.limitUsd);
  const button = "shrink-0 rounded-control px-2.5 py-1 text-small font-medium text-accent-text transition-motion hover:bg-accent-soft";
  const status = replay.done
    ? `Researched for ${formatDuration(cost.wallMs) ?? "an unknown time"}, ${plural(steps.length, "step")}`
    : replay.live
      ? `Researching, ${plural(steps.length, "step")} in ${formatDuration(replay.elapsedMs) ?? ""}`
      : `Researching, step ${Math.min(replay.shown + 1, steps.length)} of ${steps.length}`;
  return (
    <section aria-label="Research" className="rounded-card border bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <p className="min-w-0 basis-full text-small font-medium sm:basis-auto sm:flex-1">{status}</p>
        <p className="mr-auto font-mono text-mono sm:mr-0">
          {formatUsd(spent)}
          {cost.limitUsd !== null && <span className="text-fg-subtle"> of {formatUsd(cost.limitUsd)}</span>}
        </p>
        {replay.done ? (
          <div className="flex items-center gap-1">
            {steps.length > 0 && (
              <button type="button" className={button} aria-expanded={expanded} onClick={() => setExpanded((on) => !on)}>
                {expanded ? "Hide steps" : "Show steps"}
              </button>
            )}
            <button type="button" className={button} onClick={replay.restart}>
              Replay
            </button>
          </div>
        ) : (
          !replay.live && (
            <button type="button" className={button} onClick={replay.skip}>
              Skip to answer
            </button>
          )
        )}
      </div>
      {share !== null && (
        <div className="mx-4 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${share * 100}%` }} />
        </div>
      )}
      <div className="px-4 pt-1 pb-2">
        {!replay.done && (visible.length === 0 ? <p className="py-2 text-small text-fg-muted">Starting...</p> : <StepList steps={visible.slice(-LIVE_STEPS)} />)}
        {replay.done && expanded && <StepList steps={steps} />}
        {replay.live && <LiveNote className="border-t pt-2" />}
      </div>
    </section>
  );
}
