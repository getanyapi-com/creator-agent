import type { PatternView } from "@/data/types";
import { VideoStrip } from "@/thread/VideoStrip";

/** Each pattern the agent saw, as a row of the videos that show it. Two columns from 720px of the Patterns section's own width (its container; the md window less the page's side padding), so the rows follow the page when the watch sidebar narrows it. */
export function PatternRows({ patterns }: { patterns: PatternView[] }) {
  return (
    <ul className="space-y-6">
      {patterns.map((pattern, index) => (
        <li key={index} className="grid gap-3 @min-[720px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @min-[720px]:gap-6">
          <p className="text-body">{pattern.text}</p>
          <VideoStrip videos={pattern.videos} heading="Patterns" reason={pattern.text} />
        </li>
      ))}
    </ul>
  );
}
