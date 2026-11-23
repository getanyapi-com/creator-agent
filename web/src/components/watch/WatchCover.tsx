"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import type { CreatorView, VideoView } from "@/data/types";
import { useWatch } from "./WatchContext";

interface Props {
  video: VideoView;
  creator?: CreatorView | null;
  /** The section the cover sits in, shown with the video in the sidebar. */
  heading: string;
  reason: string | null;
  /** What the cover says to a screen reader, for example "Watch @handle's video". */
  label: string;
  className?: string;
  /** The cover itself, told whether its video is the one in the sidebar and whether it plays on this page. */
  children: (state: { watching: boolean; playsHere: boolean }) => ReactNode;
}

/**
 * A video cover that opens the watch sidebar. It joins the page's list of videos, which previous and next
 * walk in reading order. On a page without the sidebar it is a link to the video on TikTok.
 */
export function WatchCover({ video, creator = null, heading, reason, label, className = "", children }: Props) {
  const watch = useWatch();
  const register = watch?.register;
  const id = useId();
  const element = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (register === undefined || element.current === null) return;
    return register(id, element.current, { video, creator, heading, reason });
  }, [register, id, video, creator, heading, reason]);

  if (watch === null) {
    return (
      <a href={video.url} target="_blank" rel="noreferrer" title={video.caption ?? undefined} className={className}>
        {children({ watching: false, playsHere: false })}
      </a>
    );
  }
  const watching = watch.watching === id;
  return (
    <button ref={element} type="button" onClick={() => watch.open(id)} aria-label={label} aria-current={watching} className={className}>
      {children({ watching, playsHere: true })}
    </button>
  );
}
