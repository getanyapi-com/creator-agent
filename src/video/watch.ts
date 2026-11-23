import type { Spender } from "../budget.ts";
import type { Observation } from "../evidence.ts";
import { MODEL_MAX_TOKENS, MODEL_TIMEOUT_MS } from "../limits.ts";
import type { ChatModel, ChatRequest, ContentPart } from "../llm.ts";
import { callModel } from "../modelCall.ts";
import { GLM_VIDEO_TOKENS_PER_SECOND, QWEN_OUTPUT_HOLD_TOKENS, QWEN_VIDEO_TOKENS_PER_SECOND, videoBoundUsd, type ModelPrices } from "../modelCost.ts";
import { GLM_MAX_ORIGINAL_BYTES } from "./limits.ts";

/**
 * Qwen's limit on one video call, from round 4's measurement (B3, bench/video-compare.md): run with
 * the agent's model-call timeout as its limit on 19 videos of 12 to 177 s, it answered 18 times in 32
 * to 169 s (the slowest an 89 s video) and was cut once, on a 145 s video, at 180 s. The decision: wait for
 * Qwen "as long as it doesn't take an absurd amount of time"; the slowest answer fits this limit and
 * a shorter one would have cut it, so the limit stays the model-call timeout.
 */
export const QWEN_TIMEOUT_MS = MODEL_TIMEOUT_MS;
/** GLM answered on the original at this output limit (round 4, B3: "max_tokens 6000", 30 s and 43 s). */
export const GLM_VIDEO_MAX_TOKENS = 6000;

export const WATCH_PROMPT = `Watch this TikTok video. Report only what you can see or hear. Reply with JSON only:
{"observations":[{"at":"0:00-0:03","what":"..."}],"on_screen_text":[{"at":"0:01","what":"exact text"}],
"looked_at":"what you watched and listened to","hypothesis":"why this video may have done well, as a guess"}
Observations are facts with timestamps; keep guesses only in "hypothesis". Quote on-screen text exactly.`;

export interface WatchOutput {
  model: string;
  /** Why the first watcher did not answer, when the second one did; null when the first did. */
  fallbackReason: string | null;
  observations: Observation[];
  onScreenText: Observation[];
  lookedAt: string;
  hypothesis: string;
}

export interface WatchInput {
  llm: ChatModel;
  budget: Spender;
  prices: ModelPrices;
  original: Uint8Array;
  /** Makes the 360p copy Qwen watches. */
  downscale: () => Promise<Uint8Array | null>;
  seconds: number;
  /** `primary` (Qwen) watches the downscaled copy; `fallback` (GLM) the original file. */
  models: { primary: string; fallback: string };
}

/**
 * Qwen on the downscaled copy first, and waited for (decided 2026-11-21). GLM on the original, as a
 * `video_url` part, only when Qwen errors, passes its limit or answers with something unreadable,
 * and only when the original is within what the video path takes. Qwen ignores `max_tokens`, so its
 * call is held at the largest output measured; anything it bills above that is house cost, never the
 * question's money. The video model necessarily sees and hears the video; what it writes is cleaned
 * by the caller before it is stored, shown or passed on.
 */
export async function watchVideo(input: WatchInput): Promise<WatchOutput | { error: string }> {
  const errors: string[] = [];
  const small = await input.downscale().catch(() => null);
  if (small) {
    const part: ContentPart = { type: "video_url", video_url: { url: dataUrl(small) } };
    const shape = { timeoutMs: QWEN_TIMEOUT_MS, maxTokens: MODEL_MAX_TOKENS, heldTokens: QWEN_OUTPUT_HOLD_TOKENS, tokensPerSecond: QWEN_VIDEO_TOKENS_PER_SECOND };
    const out = await ask(input, input.models.primary, part, shape, errors);
    if (out) return { ...out, fallbackReason: null };
  } else {
    errors.push("no downscaled copy for the first video model");
  }
  if (input.original.byteLength > GLM_MAX_ORIGINAL_BYTES) return { error: errors.join(" | ") };
  const part: ContentPart = { type: "video_url", video_url: { url: dataUrl(input.original) } };
  const shape = { timeoutMs: MODEL_TIMEOUT_MS, maxTokens: GLM_VIDEO_MAX_TOKENS, heldTokens: GLM_VIDEO_MAX_TOKENS, tokensPerSecond: GLM_VIDEO_TOKENS_PER_SECOND };
  const out = await ask(input, input.models.fallback, part, shape, errors);
  return out ? { ...out, fallbackReason: errors.join(" | ") } : { error: errors.join(" | ") };
}

function dataUrl(bytes: Uint8Array): string {
  return `data:video/mp4;base64,${Buffer.from(bytes).toString("base64")}`;
}

interface CallShape {
  timeoutMs: number;
  maxTokens: number;
  /** Output tokens held: `maxTokens` for a model that respects it, the most measured for one that does not. */
  heldTokens: number;
  tokensPerSecond: number;
}

/**
 * A reply billed no more input tokens than the prompt text has bytes was given no video tokens: the
 * model did not receive the video. GLM did this on 3 of 11 calls on 2026-11-21 (119 input tokens,
 * the prompt alone) and still answered, once with "No video content was accessible" as an observation.
 */
function sawNoVideo(promptTokens: number | null | undefined): boolean {
  return typeof promptTokens === "number" && promptTokens <= Buffer.byteLength(WATCH_PROMPT);
}

async function ask(input: WatchInput, model: string, part: ContentPart, shape: CallShape, errors: string[]): Promise<Omit<WatchOutput, "fallbackReason"> | null> {
  const request: ChatRequest = {
    models: [model],
    messages: [{ role: "user", content: [{ type: "text", text: WATCH_PROMPT }, part] }],
    maxTokens: shape.maxTokens,
    timeoutMs: shape.timeoutMs,
  };
  const bound = (m: string): number => videoBoundUsd(input.prices, m, Buffer.byteLength(WATCH_PROMPT), input.seconds, shape.heldTokens, shape.tokensPerSecond);
  try {
    const res = await callModel(input.llm, input.budget, request, bound);
    if (sawNoVideo(res.promptTokens)) {
      errors.push(`${model}: did not receive the video`);
      return null;
    }
    const parsed = parseWatch(res.content);
    if (!parsed) errors.push(`${model}: reply was not the JSON asked for`);
    return parsed && { model, ...parsed };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return null;
  }
}

function observations(value: unknown): Observation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null)
    .map((o) => ({ at: String(o.at ?? ""), what: String(o.what ?? o.text ?? "") }))
    .filter((o) => o.what);
}

/** Reads the JSON object out of a model reply, tolerating code fences or text around it. */
export function parseWatch(content: string): Omit<WatchOutput, "model" | "fallbackReason"> | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
    const obs = observations(raw.observations);
    if (obs.length === 0) return null;
    return {
      observations: obs,
      onScreenText: observations(raw.on_screen_text),
      lookedAt: String(raw.looked_at ?? ""),
      hypothesis: String(raw.hypothesis ?? ""),
    };
  } catch {
    return null;
  }
}
