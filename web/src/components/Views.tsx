import type { CreatorView } from "@/data/types";
import { formatCount, formatRatio } from "@/lib/format";

/** The creator's usual views against the proof video's, on one scale, so the breakout is visible. */
export function Views({ creator }: { creator: CreatorView }) {
  const proof = creator.proof?.views ?? null;
  const usual = creator.usualViews;
  const max = Math.max(proof ?? 0, usual ?? 0);
  const width = (value: number | null) => (value === null || max === 0 ? 0 : Math.max(1.5, (value / max) * 100));
  const rows = [
    { label: "Usual", value: usual, fill: "bg-fg-subtle" },
    { label: "This video", value: proof, fill: "bg-accent" },
  ];
  return (
    <div className="text-small">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <span className="text-fg-muted">{row.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <span className={`block h-full rounded-full ${row.fill}`} style={{ width: `${width(row.value)}%` }} />
            </span>
            <span className="text-right font-mono text-mono">{formatCount(row.value)}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-fg-muted">
        {creator.proofVsUsualRatio !== null && <span className="font-medium text-fg">{formatRatio(creator.proofVsUsualRatio)} their usual. </span>}
        {usual === null || !creator.postsSampled
          ? "Recent posts were not sampled, so usual views are unknown."
          : `Usual is the median of their last ${creator.postsSampled} posts.`}
      </p>
    </div>
  );
}
