"use client";

import { useEffect, useRef, useState } from "react";
import { TikTokMark } from "@/components/TikTokMark";
import type { VideoView } from "@/data/types";
import { playerUrl } from "@/lib/tiktokPlayer";
import { useTikTokPlayer } from "./useTikTokPlayer";

interface Props {
  video: VideoView;
  title: string;
  /** The player's box, in pixels, at TikTok's 9:16 shape. */
  width: number;
  height: number;
  /** Told when the browser kept the sound off, and when the reader turns it on. */
  onSilent: (silent: boolean) => void;
}

/**
 * TikTok's embedded player for one video, nothing of ours on top of it: TikTok draws its own controls,
 * the speaker button among them, on every edge. Mount it keyed by the video so each one starts fresh.
 * When TikTok will not play the video here, or its player does not load, the box says so.
 */
export function WatchPlayer({ video, title, width, height, onSilent }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const { status, muted, silent } = useTikTokPlayer(frame, loaded);
  const failed = status === "refused" || status === "not-loaded";
  useEffect(() => {
    onSilent(silent);
  }, [silent, onSilent]);
  return (
    <div
      data-watch-player
      data-status={status}
      data-muted={muted === null ? "unknown" : String(muted)}
      className="relative shrink-0 overflow-hidden rounded-card bg-media-stage text-media-fg"
      style={{ width, height }}
    >
      {status !== "refused" && (
        <iframe
          ref={frame}
          src={playerUrl(video.id)}
          title={title}
          onLoad={() => setLoaded(true)}
          // The tightest settings it plays under, tried on 2026-11-21: without allow-same-origin it never
          // turns ready, and without allow="autoplay" it loads but never starts (nor gets the reader's
          // click as permission for sound).
          sandbox="allow-scripts allow-same-origin"
          allow="autoplay"
          className="absolute inset-0 size-full border-0"
        />
      )}
      {failed && (
        <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-scrim p-6 text-center text-small">
          <p>{status === "refused" ? "TikTok will not play this video here." : "The TikTok player did not load."}</p>
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-control bg-media-chip px-3 py-1.5 font-medium hover:underline"
          >
            <TikTokMark size={12} />
            Watch on TikTok
          </a>
        </div>
      )}
    </div>
  );
}
