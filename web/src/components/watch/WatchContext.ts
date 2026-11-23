"use client";

import { createContext, useContext } from "react";
import type { CreatorView, VideoView } from "@/data/types";
import type { RevealResult } from "@/lib/reveal";

/** One video on the page the reader can watch, with whose it is and the section it sits in. */
export interface WatchItem {
  video: VideoView;
  /** The creator in the answer whose video this is; null for a pattern video by someone outside it. */
  creator: CreatorView | null;
  heading: string;
  reason: string | null;
}

/** What a page that has the watch sidebar offers its covers and tiles. */
export interface WatchApi {
  /** Adds a cover to the page's list of videos; returns how to take it off. */
  register: (id: string, element: HTMLElement, item: WatchItem) => () => void;
  open: (id: string) => void;
  /** The cover whose video is in the sidebar, or null when it is closed. */
  watching: string | null;
  /** What each creator's Reveal gave on this page, shared by the tiles and the sidebar. */
  reveals: Record<string, RevealResult>;
  reveal: (handle: string) => void;
}

export const WatchContext = createContext<WatchApi | null>(null);

/** The page's watch sidebar, or null on a page without one (a cover there links to TikTok instead). */
export function useWatch(): WatchApi | null {
  return useContext(WatchContext);
}

/** Reveal results for the page; only inside a WatchPage. */
export function useWatchReveals(): Pick<WatchApi, "reveals" | "reveal"> {
  const watch = useContext(WatchContext);
  if (watch === null) throw new Error("useWatchReveals is used outside a WatchPage");
  return { reveals: watch.reveals, reveal: watch.reveal };
}
