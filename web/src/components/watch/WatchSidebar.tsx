"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { EvidenceView } from "@/data/types";
import type { RevealResult } from "@/lib/reveal";
import type { WatchItem } from "./WatchContext";
import { WatchDetails } from "./WatchDetails";
import { WatchFacts } from "./WatchFacts";
import { WatchHeader } from "./WatchHeader";
import { DETAILS_WIDTH, GUTTER, type WatchLayout } from "./watchLayout";
import { WatchPlayer } from "./WatchPlayer";
import { useDrawerDrag } from "./useDrawerDrag";

interface Props {
  item: WatchItem;
  /** Changes with every pick, so picking the same video again restarts it. */
  playKey: string;
  index: number;
  total: number;
  layout: WatchLayout;
  detailsOpen: boolean;
  onDetails: (open: boolean) => void;
  /** Told the height of everything in the video's column that is not the video, so the video can take the rest. */
  onChrome: (height: number) => void;
  onStep: (delta: number) => void;
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
  evidence: Record<string, EvidenceView>;
  reveals: Record<string, RevealResult>;
  onReveal: (handle: string) => void;
}

/**
 * The one place a video plays on the page. On a wide window, a sidebar on the right running the window's
 * full height, the page moved over beside it; on a narrow one, a drawer from the bottom over a page that
 * does not scroll. The video takes all the height the header and facts leave; the details sit in a
 * column beside it when the window has room, otherwise below it, reached by scrolling the sidebar.
 */
export function WatchSidebar(props: Props) {
  const { item, playKey, index, total, layout, detailsOpen, onDetails, onChrome, onStep, onClose, closeRef } = props;
  const drawer = layout.mode === "drawer";
  const beside = layout.detailsBeside;
  const scroller = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const facts = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDivElement>(null);
  const [silent, setSilent] = useState(false);
  const drag = useDrawerDrag(onClose);
  const onSilent = useCallback((next: boolean) => setSilent(next), []);
  const handle = item.creator?.handle ?? item.video.creator;

  useLayoutEffect(() => {
    const measure = () => onChrome((top.current?.offsetHeight ?? 0) + (facts.current?.offsetHeight ?? 0));
    measure();
    const observer = new ResizeObserver(measure);
    for (const part of [top.current, facts.current]) if (part !== null) observer.observe(part);
    return () => observer.disconnect();
  }, [onChrome, drawer]);

  // The page behind the drawer stays where it is; the sidebar leaves the page free to scroll.
  useEffect(() => {
    if (!drawer) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [drawer]);

  // A new video starts at the top of the sidebar, with the video in view.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [playKey]);

  const showDetails = () => {
    if (beside) onDetails(!detailsOpen);
    else details.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // The sidebar's width is exactly what the page gave up for it, its border included.
  const width = drawer ? undefined : layout.panelWidth + (beside && detailsOpen ? DETAILS_WIDTH : 0);
  return (
    <aside
      aria-label="Video player"
      className={`fixed right-0 bottom-0 z-40 flex bg-surface ${drawer ? "left-0 flex-col rounded-t-card border-t shadow-2xl transition-[translate] starting:translate-y-full" : "border-l"}`}
      style={{ top: layout.top, width, ...(drag.offset > 0 ? { translate: `0 ${drag.offset}px`, transition: "none" } : {}) }}
    >
      {beside && detailsOpen && (
        <div aria-label="Details" className="min-h-0 shrink-0 overflow-y-auto overscroll-contain border-r" style={{ width: DETAILS_WIDTH }}>
          <WatchDetails item={item} evidence={props.evidence} reveal={handle === "" ? undefined : props.reveals[handle]} onReveal={props.onReveal} />
        </div>
      )}
      <div ref={scroller} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div ref={top} className={`sticky top-0 z-10 shrink-0 border-b bg-surface ${drawer ? "touch-none" : ""}`} {...(drawer ? drag.handlers : {})}>
          {drawer && <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" />}
          <WatchHeader item={item} index={index} total={total} onStep={onStep} onClose={onClose} closeRef={closeRef} />
        </div>
        <div className="flex shrink-0 justify-center" style={{ paddingTop: GUTTER }}>
          <WatchPlayer
            key={playKey}
            video={item.video}
            title={handle === "" ? "TikTok video" : `@${handle}'s video`}
            width={layout.videoWidth}
            height={layout.videoHeight}
            onSilent={onSilent}
          />
        </div>
        <div ref={facts} className="shrink-0">
          <WatchFacts
            item={item}
            reveal={handle === "" ? undefined : props.reveals[handle]}
            onReveal={props.onReveal}
            silent={silent}
            detailsOpen={beside ? detailsOpen : null}
            onDetails={showDetails}
          />
        </div>
        {!beside && (
          <div ref={details} aria-label="Details" className="shrink-0 border-t">
            <WatchDetails item={item} evidence={props.evidence} reveal={handle === "" ? undefined : props.reveals[handle]} onReveal={props.onReveal} />
          </div>
        )}
      </div>
    </aside>
  );
}
