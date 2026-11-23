"use client";

import { useState } from "react";
import { useRemoveThread } from "@/auth/RemoveThread";
import { CriteriaLine } from "@/components/CriteriaLine";
import { formatStamp } from "@/lib/format";
import type { ThreadView } from "@/data/types";
import { useReplay } from "@/lib/useReplay";
import { Header } from "@/components/Header";
import { Notes } from "@/thread/Notes";
import { WalletStopNote } from "@/thread/WalletStopNote";
import { Patterns } from "@/thread/Patterns";
import { ResearchBar } from "@/thread/ResearchBar";
import { Section } from "@/thread/Section";
import { ThreadActions } from "@/thread/ThreadActions";
import { AnswerText } from "@/components/AnswerText";
import { WatchPage } from "@/components/watch/WatchPage";

/** A thread as a video wall: the question and short answer on top, then each section of the answer with its creators' proof videos, which play in the watch sidebar. */
export function ThreadContent({ thread, isAsker }: { thread: ThreadView; isAsker: boolean }) {
  const replay = useReplay(thread.id, thread.steps);
  const [removed, setRemoved] = useState(false);
  const removeThread = useRemoveThread();
  const asked = formatStamp(thread.askedAt);
  return (
    <WatchPage thread={thread}>
      <Header showNewQuestion />
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {removed ? (
          <p className="mt-10 rounded-card border bg-surface p-4">You removed this thread. It is no longer public.</p>
        ) : (
          <>
            <div className="max-w-3xl pt-8 sm:pt-10">
              <p className="text-small text-fg-subtle">
                {thread.tier === "free" ? "Public question" : "Private question"}
                {asked !== null && ` · ${asked}`}
              </p>
              <h1 className="mt-2 text-[26px] leading-tight font-semibold tracking-tight text-balance sm:text-display">{thread.question}</h1>
              <div className="mt-3">
                <ThreadActions isAsker={isAsker} onRemove={() => removeThread(() => setRemoved(true))} />
              </div>
            </div>
            <div className="mt-6">
              <ResearchBar steps={thread.steps} cost={thread.cost} replay={replay} />
            </div>
            {thread.walletStop !== null && <WalletStopNote stop={thread.walletStop} />}
            {replay.done && (
              <>
                <AnswerText sentences={thread.answer} implied={thread.finishedBy === "unconfirmed" ? "limit" : undefined} className="mt-8 max-w-3xl sm:text-lead" />
                <CriteriaLine text={thread.criteriaLine} className="mt-4 max-w-3xl" />
                {thread.sections.map((section, index) => (
                  <Section key={index} section={section} />
                ))}
                {thread.close !== null && <Section section={thread.close} />}
                <Patterns patterns={thread.patterns} />
                <Notes thread={thread} />
              </>
            )}
          </>
        )}
      </main>
    </WatchPage>
  );
}
