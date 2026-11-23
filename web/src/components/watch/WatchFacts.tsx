import { ListChecks } from "lucide-react";
import { TikTokMark } from "@/components/TikTokMark";
import { formatCount, formatRatio } from "@/lib/format";
import type { RevealResult } from "@/lib/reveal";
import { criteriaSummary } from "@/components/criteriaSummary";
import { Reveal } from "@/components/Reveal";
import type { WatchItem } from "./WatchContext";

interface Props {
  item: WatchItem;
  reveal: RevealResult | undefined;
  onReveal: (handle: string) => void;
  /** The player plays muted because the browser would not allow sound. */
  silent: boolean;
  /** Whether the details column is open; null where the details sit below and the button scrolls to them. */
  detailsOpen: boolean | null;
  onDetails: () => void;
}

/** Under the video: its views against the creator's usual, how many criteria are met, Reveal, Details and the link to TikTok. */
export function WatchFacts({ item, reveal, onReveal, silent, detailsOpen, onDetails }: Props) {
  const { creator, video } = item;
  const summary = creator === null ? null : criteriaSummary(creator.criteria);
  return (
    <div className="space-y-1 px-4 pt-3 pb-4 text-small">
      {/* One line each, whatever the sidebar's width, so the video's height (what these leave) does not depend on it. */}
      <p className="truncate">
        <span className="font-mono text-mono font-medium">{formatCount(video.views)}</span> <span className="text-fg-muted">views</span>
        {creator?.proofVsUsualRatio != null && (
          <>
            <span className="text-fg-muted"> · </span>
            <span className="font-mono text-mono font-medium text-accent-text">{formatRatio(creator.proofVsUsualRatio)}</span>{" "}
            <span className="text-fg-muted">their usual {formatCount(creator.usualViews)} views</span>
          </>
        )}
      </p>
      {summary !== null && (
        <p className="truncate">
          {summary.met}
          {summary.contradicted > 0 && <span className="text-contradicted"> · {summary.contradicted} contradicted</span>}
        </p>
      )}
      {silent && <p className="text-fg-muted">This browser started it muted. Turn the sound on with TikTok&apos;s speaker button on the video.</p>}
      <div className="flex items-center gap-2 pt-1.5">
        {creator !== null && <Reveal handle={creator.handle} result={reveal} onReveal={() => onReveal(creator.handle)} />}
        <button
          type="button"
          onClick={onDetails}
          aria-expanded={detailsOpen ?? undefined}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-control border px-2.5 py-1 font-medium transition-motion hover:bg-surface-2 ${detailsOpen === true ? "bg-accent-soft" : "bg-bg"}`}
        >
          <ListChecks size={13} aria-hidden />
          Details
        </button>
        <a href={video.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-w-0 items-center gap-1.5 font-medium text-accent-text hover:underline">
          <TikTokMark size={12} />
          <span className="truncate">Watch on TikTok</span>
        </a>
      </div>
    </div>
  );
}
