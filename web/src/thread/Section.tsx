import type { SectionView } from "@/data/types";
import { plural } from "@/lib/format";
import { VideoStrip } from "@/thread/VideoStrip";
import { Wall } from "@/thread/Wall";

/** One section of the answer: its heading and reason, then its creators as a wall, or a pattern's videos as a row. */
export function Section({ section }: { section: SectionView }) {
  const creators = section.creators.length > 0;
  return (
    <section aria-label={section.heading} className="@container mt-12">
      <h2 className="text-h3 font-semibold">
        {section.heading}
        <span className="ml-2 text-small font-normal text-fg-muted">{creators ? plural(section.creators.length, "creator") : plural(section.videos.length, "video")}</span>
      </h2>
      {section.reason !== null && <p className="mt-1.5 max-w-3xl">{section.reason}</p>}
      <div className="mt-4">{creators ? <Wall section={section} /> : <VideoStrip videos={section.videos} heading={section.heading} reason={section.reason} />}</div>
    </section>
  );
}
