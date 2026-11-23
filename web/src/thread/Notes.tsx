import type { ReactNode } from "react";
import { AnswerText } from "@/components/AnswerText";
import type { ThreadView } from "@/data/types";
import { formatDuration, formatUsd, plural } from "@/lib/format";

function Note({ title, items }: { title: string; items: ReactNode[] }) {
  return (
    <section>
      <h2 className="text-small font-medium text-fg-muted">{title}</h2>
      <ul className="mt-2 space-y-1.5 text-small">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function costLine(thread: ThreadView): string {
  const { cost } = thread;
  const limit = cost.limitUsd === null ? "" : ` of the ${formatUsd(cost.limitUsd)} ${thread.tier === "free" ? "free " : ""}limit`;
  return [`Cost ${formatUsd(cost.totalUsd)}${limit}`, cost.dataCalls === null ? null : plural(cost.dataCalls, "data call"), plural(cost.modelTurns, "model turn"), formatDuration(cost.wallMs)]
    .filter((part) => part !== null)
    .join(" · ");
}

/** The small print under the wall: the creators looked up by handle whose profile never came back, what was assumed, what limited the answer, and what it cost. */
export function Notes({ thread }: { thread: ThreadView }) {
  const limits = [
    thread.finishedBy === "forced"
      ? "The research reached its step limit before the agent finished, so these creators were found but not checked against the question."
      : null,
    thread.limits.length > 0 ? <AnswerText sentences={thread.limits} implied="limit" /> : null,
    thread.budgetNote,
  ].filter((note) => note !== null);
  const notes = [
    thread.notFound.length > 0 && <Note key="nf" title="Looked up, but TikTok returned no profile" items={thread.notFound.map((handle) => `@${handle}`)} />,
    thread.assumptions.length > 0 && <Note key="as" title="Assumptions" items={thread.assumptions} />,
    limits.length > 0 && <Note key="li" title="What limited this answer" items={limits} />,
  ].filter((note) => note !== false);
  return (
    <div className="mt-14 border-t pt-6">
      {notes.length > 0 && <div className="grid gap-8 md:grid-cols-2">{notes}</div>}
      <p className="mt-8 font-mono text-mono text-fg-muted">{costLine(thread)}</p>
    </div>
  );
}
