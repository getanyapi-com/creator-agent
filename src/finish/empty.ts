import type { Answer } from "../answer.ts";
import { formatUsd } from "../money.ts";
import type { Costs } from "../trace.ts";
import { splitSentences } from "./textClaims.ts";

/**
 * True when nothing is left of an answer after validation and verification (round 4, F5): no
 * sentence of the direct answer, no creator, close creator, video or pattern, and no handle in the
 * not-found list.
 */
export function isEmptyAnswer(a: Answer): boolean {
  const nothing = a.creators.length === 0 && (a.close ?? []).length === 0 && a.videos.length === 0 && a.patterns.length === 0;
  return !a.directAnswer.trim() && nothing && a.notFound.length === 0;
}

/** The code's own failure for an answer with nothing left: it says so plainly, with what was spent. */
export function nothingConfirmed(a: Answer, costs: Costs): Answer {
  const text = `The research finished, but nothing it found could be confirmed, so there is no answer to show. It spent ${formatUsd(costs.totalUsd)} of the ${formatUsd(costs.limitUsd)} limit.`;
  const labels = Object.fromEntries(splitSentences(text).map((t) => [t, "limit" as const]));
  return { ...a, directAnswer: text, finishedBy: "unconfirmed", sentenceLabels: { ...a.sentenceLabels, ...labels } };
}
