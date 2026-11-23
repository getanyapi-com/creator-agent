"use client";

import { RemoveThreadProvider } from "@/auth/RemoveThread";
import type { ThreadView } from "@/data/types";
import { useViewState } from "@/dev/useViewState";
import { RevealThreadContext } from "@/lib/reveal";
import { ThreadContent } from "@/thread/ThreadContent";

/**
 * Renders a thread for the chosen viewer. `isAsker` is the server's word on whether the signed-in
 * account asked this question; the dev bar's Viewer switch overrides it in dev builds.
 */
export function ThreadPage({ thread, isAsker = false }: { thread: ThreadView; isAsker?: boolean }) {
  const [state] = useViewState();
  return (
    <RevealThreadContext value={thread.id}>
      <RemoveThreadProvider threadId={thread.id}>
        <ThreadContent thread={thread} isAsker={state.asker ?? isAsker} />
      </RemoveThreadProvider>
    </RevealThreadContext>
  );
}
