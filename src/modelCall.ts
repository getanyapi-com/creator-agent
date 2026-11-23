import type { SpendOptions, Spender } from "./budget.ts";
import { isObject, ModelCallError, type ChatModel, type ChatRequest, type Completion, type ToolCall } from "./llm.ts";

export interface ChatResponse extends Completion {
  content: string;
  toolCalls: ToolCall[];
  model: string;
  /** What the question was charged for the call that answered: its bill up to its hold, or its hold when the bill is unstated or unusable. */
  chargedUsd: number;
  ms: number;
  /** Every attempt that did not answer, with why. */
  attempts: string[];
}

/** The most one attempt on a model can cost, known before it runs. */
export type BoundFn = (model: string) => number;

export class NoModelAnswered extends Error {
  readonly attempts: string[];

  constructor(attempts: string[]) {
    super(`No model answered: ${attempts.join(" | ")}`);
    this.attempts = attempts;
  }
}

/**
 * Tool calls only when every one is an object with a function name and string arguments; any other
 * shape counts as a turn with no tool call.
 */
export function parseToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return [];
  const calls: ToolCall[] = [];
  for (const [i, raw] of value.entries()) {
    const fn = isObject(raw) ? raw.function : null;
    if (!isObject(raw) || !isObject(fn) || typeof fn.name !== "string" || !fn.name || typeof fn.arguments !== "string") return [];
    calls.push({ id: typeof raw.id === "string" && raw.id ? raw.id : `call_${i}`, type: "function", function: { name: fn.name, arguments: fn.arguments } });
  }
  return calls;
}

/**
 * What a model call is settled at (round 4, F6): its stated bill when that is a number of zero or
 * more; its hold when the bill is unstated, negative or not a number. A bill above the hold is
 * settled in full, and the budget takes the hold from the question and records the rest as house cost.
 */
export function trustedBill(costUsd: number | null | undefined, reservedUsd: number): number {
  return typeof costUsd === "number" && Number.isFinite(costUsd) && costUsd >= 0 ? costUsd : reservedUsd;
}

/**
 * "A 404 with code minimum_discount_not_met means no seller right now: retry, then fall back" (spec):
 * that answer gets one retry; any other failure, a timeout included, moves on to the next model.
 */
const TRIES_WHEN_NO_SELLER = 2;

/**
 * Runs a request on its models in order with the marketplace's retry and fallback. Each attempt is
 * reserved at its own bound before it runs and refused when that does not fit; a later model runs
 * only if its own bound still fits. An attempt whose failure proves it never ran is freed; any
 * other failure (a timeout, a lost or broken response) keeps its reservation as spent. With no
 * budget (the bench judge), nothing is metered. `spend` marks closing calls. A bill above the hold
 * costs the question the hold; the rest is house cost (round 4, F6).
 */
export async function callModel(llm: ChatModel, budget: Spender | null, request: ChatRequest, bound: BoundFn, spend: SpendOptions = {}): Promise<ChatResponse> {
  const attempts: string[] = [];
  for (const model of request.models) {
    for (let attempt = 0; attempt < TRIES_WHEN_NO_SELLER; attempt += 1) {
      const reserved = budget ? bound(model) : 0;
      if (budget && !budget.reserve(reserved, "model", spend)) {
        attempts.push(`${model}: the budget has no room for this call`);
        break;
      }
      const started = Date.now();
      try {
        const done = await llm.complete(model, request);
        const billedUsd = trustedBill(done.costUsd, reserved);
        budget?.settle(reserved, billedUsd, "model");
        const chargedUsd = budget ? Math.min(billedUsd, reserved) : billedUsd;
        const content = typeof done.content === "string" ? done.content : "";
        return { ...done, content, toolCalls: parseToolCalls(done.toolCalls), model, chargedUsd, ms: Date.now() - started, attempts };
      } catch (err) {
        const failure = err instanceof ModelCallError ? err : new ModelCallError(err instanceof Error ? err.message : String(err), null);
        if (failure.notRun) budget?.settle(reserved, 0, "model");
        attempts.push(`${model}: ${failure.message}`);
        if (!failure.noSeller) break;
      }
    }
  }
  throw new NoModelAnswered(attempts);
}
