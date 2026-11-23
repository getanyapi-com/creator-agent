import type { FetchFn } from "./anyapi.ts";
import type { ModelPrices } from "./modelCost.ts";
import { provenNotRun } from "./refusal.ts";

const SURPLUS_BASE_URL = "https://api.surplusintelligence.ai/min60/v1";
export const SURPLUS_CHAT_URL = `${SURPLUS_BASE_URL}/chat/completions`;

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "image_url"; image_url: { url: string } };

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  models: string[];
  messages: ChatMessage[];
  maxTokens: number;
  timeoutMs: number;
  tools?: ToolSpec[];
  toolChoice?: "auto" | { type: "function"; function: { name: string } };
  /** Asks the model for one JSON object (`response_format: json_object`). */
  json?: boolean;
  /** Caps how much a reasoning model thinks before it answers (`reasoning_effort`). */
  reasoningEffort?: "low";
}

/** One model's answer to one request, its message fields as the service sent them; `callModel` checks their shape. */
export interface Completion {
  content: unknown;
  toolCalls: unknown;
  /** The billed cost, or null when the completion did not state it (the reservation then stands). */
  costUsd: number | null;
  /** Why the model stopped: "stop", "tool_calls", or "length" when it ran out of tokens. */
  finishReason: string | null;
  /** Input and output tokens billed (output with reasoning), when the completion stated them. */
  promptTokens?: number | null;
  completionTokens?: number | null;
}

/** A failed model call, and whether the failure proves the call never ran (so nothing was billed). */
export class ModelCallError extends Error {
  readonly noSeller: boolean;
  readonly notRun: boolean;

  constructor(message: string, status: number | null, body = "") {
    super(status === null ? message : `HTTP ${status} ${errorCode(body)}`.trim());
    this.noSeller = status === 404 && body.includes("minimum_discount_not_met");
    this.notRun = status !== null && provenNotRun(status);
  }
}

/** One attempt on one model; retries, fallback and the budget belong to `callModel`. */
export interface ChatModel {
  complete(model: string, request: ChatRequest): Promise<Completion>;
}

/** Surplus Intelligence chat completions, one attempt per call. */
export class SurplusChat implements ChatModel {
  readonly #key: string;
  readonly #fetch: FetchFn;

  constructor(key: string, fetchFn: FetchFn = fetch) {
    this.#key = key;
    this.#fetch = fetchFn;
  }

  async complete(model: string, request: ChatRequest): Promise<Completion> {
    const payload: Record<string, unknown> = { model, messages: request.messages, max_tokens: request.maxTokens };
    if (request.json) payload.response_format = { type: "json_object" };
    if (request.reasoningEffort) payload.reasoning_effort = request.reasoningEffort;
    if (request.tools) {
      payload.tools = request.tools;
      payload.tool_choice = request.toolChoice ?? "auto";
    }
    let res: Response;
    let text: string;
    try {
      res = await this.#fetch(SURPLUS_CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.#key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      text = await res.text();
    } catch (err) {
      throw new ModelCallError(err instanceof Error ? err.message : String(err), null);
    }
    if (!res.ok) throw new ModelCallError("", res.status, text);
    return parseCompletion(text);
  }

  /** The published list price of each model, read from `/models`; throws for a model it does not list. */
  async listPrices(models: string[]): Promise<ModelPrices> {
    const res = await this.#fetch(`${SURPLUS_BASE_URL}/models`, { headers: { Authorization: `Bearer ${this.#key}` } });
    if (!res.ok) throw new Error(`model list answered HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { id?: string; pricing?: { prompt?: string; completion?: string } }[] };
    const prices: ModelPrices = {};
    for (const model of models) {
      const listed = body.data?.find((m) => m.id === model)?.pricing;
      const promptUsd = Number(listed?.prompt);
      const completionUsd = Number(listed?.completion);
      if (!listed || !Number.isFinite(promptUsd) || !Number.isFinite(completionUsd)) throw new Error(`no list price for model ${model}`);
      prices[model] = { promptUsd, completionUsd };
    }
    return prices;
  }
}

function errorCode(body: string): string {
  const match = /"code"\s*:\s*"([\w.-]{1,64})"/.exec(body);
  return match?.[1] ?? "";
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a completion body without trusting its shape; a body that is not JSON is an error after the call ran. */
function parseCompletion(text: string): Completion {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ModelCallError("the completion was not JSON", null);
  }
  const choice = isObject(body) && Array.isArray(body.choices) && isObject(body.choices[0]) ? body.choices[0] : {};
  const message = isObject(choice.message) ? choice.message : {};
  const usage = isObject(body) && isObject(body.usage) ? body.usage : {};
  const micro = typeof usage.buyer_cost_micro === "number" && Number.isFinite(usage.buyer_cost_micro) ? usage.buyer_cost_micro : null;
  const tokens = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    content: message.content,
    toolCalls: message.tool_calls,
    costUsd: micro === null ? null : micro / 1e6,
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
    promptTokens: tokens(usage.prompt_tokens),
    completionTokens: tokens(usage.completion_tokens),
  };
}
