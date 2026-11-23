import type { TraceTurn } from "./trace.ts";

/** Where in the trace one evidence row was fetched: the turn's number and the call's index in its `toolCalls`. */
export interface Fetch {
  turn: number;
  callIndex: number;
}

/**
 * Maps every evidence id as the answer cites it (a video id, `@handle`, `t:<video id>`,
 * `w:<video id>`) to each tool call that fetched it, in trace order; the first is where it came from.
 */
export function evidenceIndex(trace: TraceTurn[]): Record<string, Fetch[]> {
  const index: Record<string, Fetch[]> = {};
  for (const t of trace) {
    t.toolCalls.forEach((call, callIndex) => {
      for (const id of call.fetched) (index[id] ??= []).push({ turn: t.turn, callIndex });
    });
  }
  return index;
}
