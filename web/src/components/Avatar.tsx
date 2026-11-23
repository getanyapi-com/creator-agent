"use client";

import { useState } from "react";

/** A creator's face, or their first letter when there is no picture or it fails to load. */
export function Avatar({ handle, src, size = 32, className = "" }: { handle: string; src?: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = handle.replace(/[^a-z0-9]/gi, "").slice(0, 1).toUpperCase() || "?";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft font-semibold text-accent-text ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {src !== undefined && !failed ? (
        // A plain img lets onError fall back to the initial if a local copy is missing.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initial
      )}
    </span>
  );
}
