import type { Budget, Spender } from "./budget.ts";
import { ANYAPI_BASE_URL, ENDPOINTS, type Endpoint } from "./endpoints.ts";
import { cleanUserText } from "./modelText.ts";
import type { PriceTable } from "./prices.ts";
import { provenNotRun } from "./refusal.ts";

export type FetchFn = typeof fetch;

export type RunResult =
  | { ok: true; data: Record<string, unknown> | null; costUsd: number; sourceId: string | null }
  | { ok: false; refused: boolean; error: string };

export interface CallLog {
  endpoint: Endpoint;
  priceUsd: number;
  costUsd: number;
  ms: number;
  sourceId: string | null;
  error: string | null;
}

/** What tools call data through: the session's client, or a view of it that meters one step. */
export interface DataClient {
  readonly calls: CallLog[];
  run(endpoint: Endpoint, input: Record<string, unknown>, spender?: Spender): Promise<RunResult>;
}

/** The proof's per-call timeout (`client.py`, 120 s); a hung call is ended and reported as an error. */
export const CALL_TIMEOUT_MS = 120_000;

/** What one call ended as, and what the budget should hold for it. */
interface Outcome {
  result: RunResult;
  /** The billed cost when the service stated it; null when it is not known. */
  billedUsd: number | null;
  /** True only when the service answered with a refusal that proves nothing ran. */
  notRun: boolean;
}

/**
 * AnyAPI REST client that pins every call to its source and meters it against the question budget.
 * Each call is reserved at the published price read at start. A call whose response was lost, timed
 * out or failed after it was sent keeps its reservation as spent, because the service may have
 * charged; only a refusal that proves nothing ran frees it.
 */
export class AnyApiClient implements DataClient {
  readonly calls: CallLog[] = [];
  readonly #key: string;
  readonly #budget: Budget;
  readonly #prices: PriceTable;
  readonly #fetch: FetchFn;

  constructor(key: string, budget: Budget, prices: PriceTable, fetchFn: FetchFn = fetch) {
    this.#key = key;
    this.#budget = budget;
    this.#prices = prices;
    this.#fetch = fetchFn;
  }

  /** Runs one call, reserved and settled through `spender` (the question's budget unless a step meters it). */
  async run(endpoint: Endpoint, input: Record<string, unknown>, spender: Spender = this.#budget): Promise<RunResult> {
    const priceUsd = this.#prices[endpoint];
    if (!spender.reserve(priceUsd)) {
      return { ok: false, refused: true, error: `budget: ${endpoint} costs $${priceUsd} and the limit is reached` };
    }
    const started = Date.now();
    const outcome = await this.#post(endpoint, { ...input, source: [ENDPOINTS[endpoint].source], allowFallbacks: false });
    const costUsd = trustedCost(outcome.billedUsd, priceUsd, outcome.notRun);
    spender.settle(priceUsd, costUsd);
    const { result } = outcome;
    this.calls.push({
      endpoint,
      priceUsd,
      costUsd,
      ms: Date.now() - started,
      sourceId: result.ok ? result.sourceId : null,
      error: result.ok ? null : result.error,
    });
    return result;
  }

  async #post(endpoint: Endpoint, body: Record<string, unknown>): Promise<Outcome> {
    let res: Response;
    let text: string;
    try {
      res = await this.#fetch(`${ANYAPI_BASE_URL}/v1/run/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.#key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      text = await res.text();
    } catch (err) {
      return { result: failed(err instanceof Error ? err.message : String(err)), billedUsd: null, notRun: false };
    }
    const envelope = parseJson(text);
    if (!res.ok) {
      const charged = envelope?.payment as { costUsd?: unknown } | undefined;
      return {
        result: failed(`HTTP ${res.status} ${errorCode(envelope)}`.trim()),
        billedUsd: typeof charged?.costUsd === "number" ? charged.costUsd : null,
        notRun: provenNotRun(res.status),
      };
    }
    if (!envelope) return { result: failed("the response was not JSON"), billedUsd: null, notRun: false };
    const output = envelope.output as { data?: Record<string, unknown> | null } | undefined;
    const source = envelope.source as { id?: string } | undefined;
    const costUsd = typeof envelope.costUsd === "number" ? envelope.costUsd : null;
    return {
      result: { ok: true, data: output?.data ?? null, costUsd: costUsd ?? 0, sourceId: source?.id ?? null },
      billedUsd: costUsd,
      notRun: false,
    };
  }
}

/**
 * What a call is settled at (round 4, F6): the cost the service reported when it is a number from
 * zero to the price reserved; the reserved price when it is negative, not a number or above that
 * price, or unstated after the call may have run; nothing when a refusal proves it never ran. Zero
 * stays zero: AnyAPI charges nothing for an empty result.
 */
export function trustedCost(billedUsd: number | null, reservedUsd: number, notRun: boolean): number {
  if (billedUsd === null) return notRun ? 0 : reservedUsd;
  return Number.isFinite(billedUsd) && billedUsd >= 0 && billedUsd <= reservedUsd ? billedUsd : reservedUsd;
}

function failed(error: string): RunResult {
  return { ok: false, refused: false, error: cleanUserText(error).value };
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The machine-readable code of an error envelope (`{error, code}`), never the free-text body. */
function errorCode(envelope: Record<string, unknown> | null): string {
  const code = envelope?.code ?? (envelope?.error as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && /^[\w.-]{1,64}$/.test(code) ? code : "";
}
