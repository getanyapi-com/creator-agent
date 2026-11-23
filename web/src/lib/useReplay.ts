"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { ReplayStep } from "@/data/types";

/** Recorded time runs this many times faster in the replay, so a three-minute run plays in about nine seconds. */
export const REPLAY_SPEED = 20;

/** Set around a thread whose research is happening now: steps arrive from the server instead of a recording. */
export const LiveRunContext = createContext<{ elapsedMs: number } | null>(null);

export interface Replay {
  /** How many steps are visible so far. */
  shown: number;
  done: boolean;
  /** True while the research is running for real; every step that has happened is shown and there is nothing to skip. */
  live: boolean;
  /** Time since the question was asked, while live. */
  elapsedMs: number | null;
  skip: () => void;
  restart: () => void;
}

/** Larger than any step count: a thread watched live is already seen in full when its answer arrives. */
const ALL = Number.MAX_SAFE_INTEGER;

/** Threads whose replay finished or was skipped in this tab, so coming back to one shows its answer at once. */
const seenKey = (threadId: string) => `replay-seen:${threadId}`;

function wasSeen(threadId: string): boolean {
  try {
    return sessionStorage.getItem(seenKey(threadId)) !== null;
  } catch {
    return false;
  }
}

/** Nothing else writes the mark while the page is open, so there is nothing to listen for. */
const noSubscription = () => () => undefined;

function markSeen(threadId: string): void {
  try {
    sessionStorage.setItem(seenKey(threadId), "1");
  } catch {
    // Storage can be off; the thread then replays again next time it is opened.
  }
}

/** Plays recorded steps at their recorded spacing, sped up; a live run shows its steps as they happen. */
export function useReplay(threadId: string, steps: readonly ReplayStep[]): Replay {
  const liveRun = useContext(LiveRunContext);
  const live = liveRun !== null;
  const seen = useSyncExternalStore(noSubscription, () => wasSeen(threadId), () => false);
  // Null until the replay moves, skips or restarts; until then a thread seen before in this tab shows its answer.
  const [played, setPlayed] = useState<number | null>(live ? ALL : null);
  const shown = live ? steps.length : Math.min(played ?? (seen ? ALL : 0), steps.length);
  const done = !live && shown >= steps.length;

  useEffect(() => {
    if (done) markSeen(threadId);
  }, [done, threadId]);

  useEffect(() => {
    if (done || live) return;
    const previous = shown === 0 ? 0 : (steps[shown - 1]?.atMs ?? 0);
    const next = steps[shown]?.atMs ?? previous;
    const timer = window.setTimeout(() => setPlayed(shown + 1), Math.max(0, next - previous) / REPLAY_SPEED);
    return () => window.clearTimeout(timer);
  }, [shown, done, live, steps]);

  return {
    shown,
    done,
    live,
    elapsedMs: liveRun?.elapsedMs ?? null,
    skip: () => setPlayed(ALL),
    restart: () => setPlayed(0),
  };
}
