import { callModel } from "../modelCall.ts";
import { modelBoundUsd } from "../modelCost.ts";
import type { ChatRequest } from "../llm.ts";
import type { Verifier } from "./verify.ts";

/**
 * How many times a closing check asks when its reply cannot be read (round 5). In nine replays of
 * the check on 24 saved runs (`pnpm bench closing-replay`, tags before-1..3, v4-a..c, v5-a..c), a reply
 * could not be read in 10 of the 216 runs (broken JSON, or an id it was not given), and each time
 * every claim or every sentence of that run was cut. One more, independent try is the smallest change
 * that turns such a run into a checked one.
 */
export const READ_TRIES = 2;

/**
 * Asks a closing check, on the money held for closing, and reads its reply with `read`. A reply that
 * cannot be read is asked again, while tries remain and the budget can reserve the call; a call that
 * fails or times out is not. Returns what was read (null when nothing could be) and what was charged.
 */
export async function askReadable<T>(v: Verifier, request: ChatRequest, read: (content: string) => T | null): Promise<{ value: T | null; costUsd: number; ran: boolean }> {
  let costUsd = 0;
  for (let attempt = 0; attempt < READ_TRIES; attempt += 1) {
    let content: string;
    try {
      const res = await callModel(v.llm, v.budget, request, (m) => modelBoundUsd(v.prices, m, request), { closing: true });
      costUsd += res.chargedUsd;
      content = res.content;
    } catch {
      return { value: null, costUsd, ran: attempt > 0 };
    }
    const value = read(content);
    if (value !== null) return { value, costUsd, ran: true };
  }
  return { value: null, costUsd, ran: true };
}
