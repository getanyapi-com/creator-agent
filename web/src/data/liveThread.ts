import { formatUsd } from "@/lib/format";
import { toThread } from "./adapter";
import type { LiveRun } from "./live";
import { progressSteps } from "./steps";
import type { ThreadView } from "./types";

/** What heads the page for anyone but the asker before the core's display object, whose question has passed its gate, exists. */
const UNSHOWN_QUESTION = { running: "A question is being researched.", failed: "This question stopped before it was answered." };

/**
 * A live question as the thread page renders it: through the adapter once the display object exists;
 * before that, the question, the core's progress events as steps and the money spent so far.
 */
export function liveThread(run: LiveRun): ThreadView {
  if (run.display !== null) return toThread({ ...run, display: run.display, media: (name) => run.media[name] });
  const steps = progressSteps(run.progress);
  const spentUsd = steps.at(-1)?.runningUsd ?? 0;
  const stopped =
    spentUsd === 0
      ? `${run.error ?? ""} Nothing was spent.`
      : `The research stopped before it could answer. ${run.error ?? ""} It spent ${formatUsd(spentUsd)} of the ${formatUsd(run.limitUsd)} limit.`;
  return {
    id: run.id,
    question: run.question ?? (run.status === "failed" ? UNSHOWN_QUESTION.failed : UNSHOWN_QUESTION.running),
    tier: run.tier,
    walletStop: run.walletStop,
    askedAt: run.askedAt,
    finishedBy: null,
    answer: run.status === "failed" ? [{ text: stopped.replace(/\s+/g, " "), label: "other" }] : [],
    criteriaLine: null,
    creators: [],
    sections: [],
    close: null,
    patterns: [],
    assumptions: [],
    limits: [],
    budgetNote: null,
    notFound: [],
    cost: { limitUsd: run.limitUsd, totalUsd: spentUsd, dataCalls: null, modelTurns: steps.filter((s) => s.kind === "think").length, wallMs: run.wallMs },
    steps,
    evidence: {},
  };
}
