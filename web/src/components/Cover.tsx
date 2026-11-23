"use client";

import type { ReactNode } from "react";
import { TikTokMark } from "@/components/TikTokMark";
import { useCover } from "@/components/useCover";

interface Props {
  src?: string;
  /** Shown in the middle of the neutral tile when there is no cover; the TikTok mark when omitted. */
  fallback?: ReactNode;
  /** Overlays, told whether they sit on a picture (light text on a scrim) or on the neutral tile. */
  children: (onMedia: boolean) => ReactNode;
  className?: string;
}

/** A tall video cover in TikTok's 9:16 shape, or a neutral tile when no local copy was saved. */
export function Cover({ src, fallback, children, className = "" }: Props) {
  const cover = useCover(src);
  return (
    <span className={`relative block aspect-9/16 overflow-hidden bg-surface-2 ${className}`}>
      {cover.shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" onError={cover.onError} />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3 text-center text-fg-subtle">
          {fallback ?? <TikTokMark size={18} />}
        </span>
      )}
      {children(cover.shown)}
    </span>
  );
}
