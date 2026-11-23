import { timedFetch, type FetchFn } from "../../../../src/anyapi.ts";
import { config } from "@/server/config";

const MINUTE_MS = 60_000;

/**
 * Spaces data calls evenly: each call is given the first free moment at least `spacingMs` after the call before
 * it, so calls never come in a burst. Moments are handed out in the order calls ask, so the first to ask goes first,
 * and a call only ever waits; it is never refused. The clock and the timer are passed in so a check can drive them.
 */
export class CallPace {
  #nextAt = Number.NEGATIVE_INFINITY;
  readonly #now: () => number;
  readonly #wait: (ms: number) => Promise<void>;

  constructor(now: () => number = () => Date.now(), wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
    this.#now = now;
    this.#wait = wait;
  }

  /** Resolves when it is this call's turn to be sent. */
  async turn(spacingMs: number): Promise<void> {
    const now = this.#now();
    const at = Math.max(now, this.#nextAt);
    this.#nextAt = at + spacingMs;
    if (at > now) await this.#wait(at - now);
  }
}

/** Next bundles this module once per layer, so the one pace lives on globalThis and the whole process shares it, as the database pool does. */
const holder = globalThis as typeof globalThis & { __creatorCallPace?: CallPace };

/** Waits for a data call's turn under DATA_CALLS_PER_MINUTE; with the setting unset, there is no wait. */
export async function dataCallTurn(): Promise<void> {
  const perMinute = config().DATA_CALLS_PER_MINUTE;
  if (perMinute === undefined) return;
  holder.__creatorCallPace ??= new CallPace();
  await holder.__creatorCallPace.turn(MINUTE_MS / perMinute);
}

/** Sends one AnyAPI data call (`/v1/run/...`) once it is its turn; its deadline starts when it is sent. */
export const pacedFetch: FetchFn = async (input, init) => {
  await dataCallTurn();
  return timedFetch(input, init);
};
