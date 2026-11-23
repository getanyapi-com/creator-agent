import type { PatternView } from "@/data/types";
import { PatternRows } from "@/thread/PatternRows";

/** The patterns the agent saw across the videos, under their own heading; nothing when there are none. */
export function Patterns({ patterns }: { patterns: PatternView[] }) {
  if (patterns.length === 0) return null;
  return (
    <section aria-label="Patterns" className="@container mt-12">
      <h2 className="mb-4 text-h3 font-semibold">Patterns</h2>
      <PatternRows patterns={patterns} />
    </section>
  );
}
