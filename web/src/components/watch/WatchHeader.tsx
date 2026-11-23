import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { RefObject } from "react";
import { formatFollowers } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import type { WatchItem } from "./WatchContext";

interface Props {
  item: WatchItem;
  index: number;
  total: number;
  onStep: (delta: number) => void;
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}

const CONTROL =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-control text-fg-muted transition-motion hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent";

/** Whose video it is (face, handle, followers), where it is in the page's list, previous, next and close. */
export function WatchHeader({ item, index, total, onStep, onClose, closeRef }: Props) {
  const { creator, video } = item;
  const handle = creator?.handle ?? video.creator;
  return (
    <div className="flex h-14 shrink-0 items-center gap-2.5 pr-2 pl-4">
      <Avatar handle={handle} src={creator?.avatarUrl} size={32} />
      <div className="min-w-0 flex-1 leading-tight">
        {handle === "" ? (
          <p className="truncate text-small font-semibold">Video on TikTok</p>
        ) : (
          <a href={creator?.profileUrl ?? video.url} target="_blank" rel="noreferrer" className="block truncate text-small font-semibold hover:underline">
            @{handle}
          </a>
        )}
        <p className="truncate text-small text-fg-muted">
          {creator === null ? "Not in the answer" : creator.followers === null ? "Followers unknown" : `${formatFollowers(creator.followers)} followers`}
        </p>
      </div>
      <span className="shrink-0 font-mono text-mono text-fg-muted" aria-label={`Video ${index + 1} of ${total} on this page`}>
        {index + 1}/{total}
      </span>
      <button type="button" onClick={() => onStep(-1)} disabled={index === 0} aria-label="Previous video" title="Previous (K)" className={CONTROL}>
        <ChevronLeft size={18} aria-hidden />
      </button>
      <button type="button" onClick={() => onStep(1)} disabled={index === total - 1} aria-label="Next video" title="Next (J)" className={CONTROL}>
        <ChevronRight size={18} aria-hidden />
      </button>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Close video" title="Close (Esc)" className={CONTROL}>
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
