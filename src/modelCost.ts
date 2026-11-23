import type { ChatRequest } from "./llm.ts";

/** List price per token, as the marketplace's `/models` endpoint publishes it. */
export interface ModelPrice {
  promptUsd: number;
  completionUsd: number;
}

export type ModelPrices = Record<string, ModelPrice>;

/**
 * The `/min60` floor admits only sellers at a discount of 60% or more, so a call bills at most 40% of
 * list. Measured on 2026-11-20: glm-5.3-flash billed 5.5% of list.
 */
const FLOOR_SHARE_OF_LIST = 0.4;

function priceOf(prices: ModelPrices, model: string): ModelPrice {
  const price = prices[model];
  if (!price) throw new Error(`no list price for model ${model}`);
  return price;
}

function boundUsd(price: ModelPrice, promptTokens: number, completionTokens: number): number {
  return FLOOR_SHARE_OF_LIST * (promptTokens * price.promptUsd + completionTokens * price.completionUsd);
}

/** The most a text call with this many request bytes and this output limit can bill on one model. */
export function textBoundUsd(prices: ModelPrices, model: string, requestBytes: number, maxTokens: number): number {
  return boundUsd(priceOf(prices, model), requestBytes, maxTokens);
}

/** The bytes of a text request: every byte is counted as a prompt token (a token is at least one byte). */
function requestBytes(request: Pick<ChatRequest, "messages" | "tools">): number {
  return Buffer.byteLength(JSON.stringify({ messages: request.messages, tools: request.tools ?? [] }));
}

/** The most one text call on one model can bill, known before it runs: every byte a token, every output token used. */
export function modelBoundUsd(prices: ModelPrices, model: string, request: Pick<ChatRequest, "messages" | "tools" | "maxTokens">): number {
  return boundUsd(priceOf(prices, model), requestBytes(request), request.maxTokens);
}

/** The same bound for the dearest model in a list, for holding money back before a request exists. */
export function callBoundUsd(prices: ModelPrices, request: Pick<ChatRequest, "models" | "messages" | "tools" | "maxTokens">): number {
  return Math.max(0, ...request.models.map((m) => modelBoundUsd(prices, m, request)));
}

/** What one more chunk of request text can add to a call's bound, for the dearest model in the list. */
export function bytesBoundUsd(prices: ModelPrices, models: string[], bytes: number): number {
  return Math.max(0, ...models.map((m) => FLOOR_SHARE_OF_LIST * bytes * (prices[m]?.promptUsd ?? 0)));
}

/**
 * Video and audio tokens billed per second of video, by watcher. Qwen on the downscaled copy, measured
 * on 2026-11-20 (prompt_tokens_details): 1,982 video + 58 audio tokens for 8 s (255/s), 227 to 232/s
 * from 30 to 150 s; on 2026-11-21 (round 4, B3, 19 calls) 227 to 233/s. GLM on the original, measured
 * on 2026-11-21 (8 calls that received the video): 781 to 1,217/s. The highest of each is its allowance.
 */
export const QWEN_VIDEO_TOKENS_PER_SECOND = 255;
export const GLM_VIDEO_TOKENS_PER_SECOND = 1217;
/** The shortest measured video; below it the per-second rate was not measured, so shorter ones count as this long. */
const MIN_VIDEO_SECONDS = 8;
/**
 * Qwen's output is not capped by `max_tokens` and its reasoning cannot be switched off (tried
 * `reasoning.enabled: false` and `effort: none`). The most it billed over every measured call is the
 * hold: 5,983 tokens over eight calls on 2026-11-20, and 12,159 (an 89 s video) over 19 on
 * 2026-11-21 (round 4, B3). An observed maximum, not a guarantee; above it is house cost.
 */
export const QWEN_OUTPUT_HOLD_TOKENS = 12_159;

/** The most one video call can bill, known before it runs, from the video's length, the text sent and the output held. */
export function videoBoundUsd(prices: ModelPrices, model: string, textBytes: number, seconds: number, outputTokens: number, tokensPerSecond: number): number {
  const videoTokens = tokensPerSecond * Math.max(MIN_VIDEO_SECONDS, Math.ceil(seconds));
  return boundUsd(priceOf(prices, model), textBytes + videoTokens, outputTokens);
}
