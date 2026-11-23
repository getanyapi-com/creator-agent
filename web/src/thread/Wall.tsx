"use client";

import { useWatchReveals } from "@/components/watch/WatchContext";
import type { SectionView } from "@/data/types";
import { CreatorTile } from "@/thread/CreatorTile";

/**
 * A section's creators as tall video tiles. The columns follow the section's width (Section is the
 * container), not the window's, so the wall reflows when the watch sidebar moves the page over. The
 * breakpoints are the section's width at Tailwind's sm, md and lg windows (640, 768 and 1024px less the
 * page's 24px side padding), so without the sidebar the wall is laid out as before.
 */
export function Wall({ section }: { section: SectionView }) {
  const { reveals, reveal } = useWatchReveals();
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 @min-[592px]:grid-cols-3 @min-[720px]:grid-cols-4 @min-[976px]:grid-cols-5 @min-[976px]:gap-x-4">
      {section.creators.map((creator) => (
        <CreatorTile key={creator.handle} creator={creator} section={section} reveal={reveals[creator.handle]} onReveal={() => reveal(creator.handle)} />
      ))}
    </div>
  );
}
