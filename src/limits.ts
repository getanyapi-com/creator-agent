/** Limits shared by the agent and the baseline, each with where its number comes from. */

/** Tool calls run 10 at a time, the rate the pinning proof held (20 of 20 calls at 10 in parallel). */
export const TOOL_PARALLELISM = 10;

/**
 * A reasoning model needs "max_tokens of a few thousand" (spec, Models). The video models too: at the
 * proof's 700, Qwen stopped mid-JSON (finish_reason length, 705 text tokens) on 2026-11-20.
 */
export const MODEL_MAX_TOKENS = 4000;

/** The loop proof's per-call timeout (`loop.py`, 180 s). */
export const MODEL_TIMEOUT_MS = 180_000;
