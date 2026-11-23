import { timedFetch, type FetchFn } from "../../../../src/anyapi.ts";
import { config } from "@/server/config";

const MINUTE_MS = 60_000;

/**
 * Spaces data calls evenly: calls wait in one queue, in the order they asked, and each is released at least
 * `spacingMs` after the call before it was actually released. A timer that fires late (a busy or throttled process)
 * delays the calls behind it rather than releasing them together, so calls never come in a burst. A call only ever
 * waits; it is never refused. The clock and the timer are passed in so a check can drive them.
 */
export class CallPace {
  #lastAt = Number.NEGATIVE_INFINITY;
  #releasing = false;
  readonly #queue: { spacingMs: number; go: () => void }[] = [];
  readonly #now: () => number;
  readonly #wait: (ms: number) => Promise<void>;

  constructor(now: () => number = () => Date.now(), wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
    this.#now = now;
    this.#wait = wait;
  }

  /** Resolves when it is this call's turn to be sent. */
  turn(spacingMs: number): Promise<void> {
    const turn = new Promise<void>((go) => this.#queue.push({ spacingMs, go }));
    if (!this.#releasing) void this.#release();
    return turn;
  }

  /** Releases the queue one call at a time, each once its spacing has passed since the last release. */
  async #release(): Promise<void> {
    this.#releasing = true;
    for (let next = this.#queue.shift(); next; next = this.#queue.shift()) {
      const due = this.#lastAt + next.spacingMs;
      for (let now = this.#now(); now < due; now = this.#now()) await this.#wait(due - now);
      this.#lastAt = this.#now();
      next.go();
    }
    this.#releasing = false;
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
