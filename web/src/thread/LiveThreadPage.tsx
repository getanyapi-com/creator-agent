"use client";

import { useEffect, useMemo, useState } from "react";
import { changesStill, type LiveRun } from "@/data/live";
import { liveThread } from "@/data/liveThread";
import { LiveRunContext } from "@/lib/useReplay";
import { ThreadPage } from "@/thread/ThreadPage";

/**
 * The elapsed time is shown in whole seconds, so the page asks the server for news once a second, the
 * same tick that moves the clock; it keeps that pace after the answer while its images are still being
 * saved. Progress lives on the server, so a reload picks up where it was.
 */
const TICK_MS = 1000;

/** A live question: steps as they happen, then the answer through the same components as a recorded one. */
export function LiveThreadPage({ initial, isAsker }: { initial: LiveRun; isAsker: boolean }) {
  const [run, setRun] = useState(initial);
  const [elapsedMs, setElapsedMs] = useState(initial.elapsedMs);
  const thread = useMemo(() => liveThread(run), [run]);
  const running = run.status === "running";
  const asking = changesStill(run);
  const id = run.id;

  useEffect(() => {
    if (!asking) return;
    const started = Date.now() - initial.elapsedMs;
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - started);
      fetch(`/api/runs/${id}`, { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<LiveRun>) : null))
        .then((next) => {
          if (next !== null) setRun(next);
        })
        .catch(() => undefined);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [asking, id, initial.elapsedMs]);

  // The same tree before and after the answer arrives, so the page keeps its state and does not replay what was just watched.
  return (
    <LiveRunContext value={running ? { elapsedMs } : null}>
      <ThreadPage thread={thread} isAsker={isAsker} />
    </LiveRunContext>
  );
}
