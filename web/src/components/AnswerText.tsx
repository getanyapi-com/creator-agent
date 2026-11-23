import { Fragment } from "react";
import type { AnswerSentence, SentenceLabel } from "@/data/types";

/** How a sentence that is not a finding says what it is. */
const MARK = { limit: "Limit", assumption: "Assumption" } as const;

interface Props {
  sentences: AnswerSentence[];
  /**
   * A label its sentences need not say, read plainly: the list headed "What limited this answer", or
   * an answer where nothing could be confirmed, whose whole text is the core's failure labelled a limit.
   */
  implied?: SentenceLabel;
  className?: string;
}

/** Sentences as one paragraph in the core's order; a limit or an assumption is muted and says which it is. */
export function AnswerText({ sentences, implied, className = "" }: Props) {
  if (sentences.length === 0) return null;
  return (
    <p className={className}>
      {sentences.map((s, index) => (
        <Fragment key={index}>
          {index > 0 && " "}
          {(s.label === "limit" || s.label === "assumption") && s.label !== implied ? (
            <span className="text-fg-muted">
              <span className="font-medium">{MARK[s.label]}:</span> {s.text}
            </span>
          ) : (
            s.text
          )}
        </Fragment>
      ))}
    </p>
  );
}
