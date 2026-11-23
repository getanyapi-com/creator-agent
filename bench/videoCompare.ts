import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { AnyApiClient } from "../src/anyapi.ts";
import { Budget } from "../src/budget.ts";
import { mapLimit } from "../src/concurrency.ts";
import { MODEL_MAX_TOKENS, MODEL_TIMEOUT_MS } from "../src/limits.ts";
import type { ChatModel, ContentPart } from "../src/llm.ts";
import { readPublishedPrices } from "../src/prices.ts";
import { downscaleVideo } from "../src/video/downscale.ts";
import { fetchVideoFile } from "../src/video/fetchVideo.ts";
import { GLM_MAX_ORIGINAL_BYTES } from "../src/video/limits.ts";
import { probeSeconds } from "../src/video/probe.ts";
import { WATCH_PROMPT } from "../src/video/watch.ts";
import { VIDEO_MODELS } from "../src/models.ts";
import { liveChat, readKey } from "./live.ts";
import { OUT_DIR } from "./questions.ts";

const run = promisify(execFile);

/**
 * Round 4, B3: the videos the Qwen and GLM watchers are compared on, at lengths of about 15, 30, 60,
 * 90 and 150 s, picked from saved runs; `spokenHook` marks those whose hook is said, not written.
 * Four of the first ten picked had originals over the video path's file limit, so more were added
 * at those lengths.
 */
export const COMPARE_VIDEOS = [
  { author: "duolingo", id: "7707022192655060237", spokenHook: false },
  { author: "jordynnehahn", id: "7670679998281321759", spokenHook: false },
  { author: "tooned.ai", id: "7697388056269131039", spokenHook: true },
  { author: "madisonspeaksspanish", id: "7708890457387961614", spokenHook: true },
  { author: "hershygoldstein", id: "7707792329792310541", spokenHook: true },
  { author: "dallasstudydiaries", id: "7703014348624596254", spokenHook: false },
  { author: "viralex.aii", id: "7703911645583592736", spokenHook: true },
  { author: "shinygirlxoxo", id: "7709307973750820109", spokenHook: false },
  { author: "algerianenglishman", id: "7708790059733929248", spokenHook: true },
  { author: "hunnyygirll", id: "7707359863701114126", spokenHook: false },
  { author: "numbersgirldaja", id: "7707085996566842654", spokenHook: true },
  { author: "askcatgpt", id: "7665456895666212110", spokenHook: true },
  { author: "curv_lab", id: "7687004597587692813", spokenHook: true },
  { author: "addystudys", id: "7709756377442422029", spokenHook: false },
  { author: "michelann_", id: "7709067741239512341", spokenHook: true },
  { author: "willfrancis24", id: "7496536019211177238", spokenHook: true },
  { author: "worstcase.stories1", id: "7707035027921554719", spokenHook: false },
];

/** The contract's AnyAPI allowance for this comparison (round 4, B3: under $0.10). */
const DATA_LIMIT_USD = 0.1;
/** The earlier GLM probe answered at this output limit (round 4, B3: "max_tokens 6000"). */
const GLM_MAX_TOKENS = 6000;
/** Videos compared at once; each runs its three calls together. */
const VIDEOS_AT_ONCE = 2;

interface CallRecord {
  video: string;
  variant: "qwen-small" | "glm-original" | "glm-original-transcript";
  model: string;
  ms: number;
  costUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  finishReason: string | null;
  content: string;
  error: string | null;
}

const dataUrl = (bytes: Uint8Array): string => `data:video/mp4;base64,${Buffer.from(bytes).toString("base64")}`;

async function call(llm: ChatModel, video: string, variant: CallRecord["variant"], model: string, parts: ContentPart[], maxTokens: number): Promise<CallRecord> {
  const started = Date.now();
  try {
    const done = await llm.complete(model, { models: [model], messages: [{ role: "user", content: parts }], maxTokens, timeoutMs: MODEL_TIMEOUT_MS });
    const content = typeof done.content === "string" ? done.content : "";
    return { video, variant, model, ms: Date.now() - started, costUsd: done.costUsd, promptTokens: done.promptTokens ?? null, completionTokens: done.completionTokens ?? null, finishReason: done.finishReason, content, error: null };
  } catch (err) {
    return { video, variant, model, ms: Date.now() - started, costUsd: null, promptTokens: null, completionTokens: null, finishReason: null, content: "", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Frames for checking the answers by eye: 24 across the whole video, and the first six seconds at two a second. */
async function contactSheets(file: string, seconds: number, dir: string, id: string): Promise<void> {
  const whole = ["-y", "-loglevel", "error", "-i", file, "-vf", `fps=24/${seconds},scale=240:-2,tile=6x4`, "-frames:v", "1", `${dir}/${id}-whole.jpg`];
  const hook = ["-y", "-loglevel", "error", "-t", "6", "-i", file, "-vf", "fps=2,scale=240:-2,tile=6x2", "-frames:v", "1", `${dir}/${id}-hook.jpg`];
  await run("ffmpeg", whole);
  await run("ffmpeg", hook);
}

/**
 * Downloads each chosen video once, then has Qwen watch the downscaled copy and GLM the original,
 * alone and with the transcript. Files over the video path's limit are downloaded too, so Qwen is
 * timed on them; GLM is not sent an original over that limit, as in the agent.
 */
export async function videoCompare(only: string[]): Promise<string> {
  const key = readKey("ANYAPI_KEY_FILE");
  const budget = new Budget(DATA_LIMIT_USD);
  const anyapi = new AnyApiClient(key, budget, await readPublishedPrices(key));
  const llm = liveChat();
  const dir = new URL(`video-compare/${new Date().toISOString().replace(/[:.]/g, "-")}/`, OUT_DIR);
  mkdirSync(dir, { recursive: true });
  const path = fileURLToPath(dir);
  const records: CallRecord[] = [];
  const chosen = COMPARE_VIDEOS.filter((v) => only.length === 0 || only.includes(v.id));
  await mapLimit(chosen, VIDEOS_AT_ONCE, async (v) => {
    const url = `https://www.tiktok.com/@${v.author}/video/${v.id}`;
    const [download, transcript] = await Promise.all([anyapi.run("tiktok.video_download", { url }), anyapi.run("tiktok.video_transcript", { url })]);
    const fileUrl = download.ok ? download.data?.sdVideoUrl ?? download.data?.videoUrl : null;
    const file = typeof fileUrl === "string" ? await fetchVideoFile(fileUrl, fetch, Infinity) : { ok: false as const, error: "no file" };
    const text = transcript.ok && typeof transcript.data?.transcript === "string" ? transcript.data.transcript : "";
    writeFileSync(`${path}/${v.id}-transcript.txt`, text);
    if (!file.ok) {
      records.push({ video: v.id, variant: "qwen-small", model: VIDEO_MODELS.primary, ms: 0, costUsd: null, promptTokens: null, completionTokens: null, finishReason: null, content: "", error: file.error });
      return;
    }
    writeFileSync(`${path}/${v.id}.mp4`, file.bytes);
    const seconds = (await probeSeconds(file.bytes)) ?? 0;
    await contactSheets(`${path}/${v.id}.mp4`, seconds, path, v.id);
    const small = await downscaleVideo(file.bytes);
    const prompt: ContentPart = { type: "text", text: WATCH_PROMPT };
    const withTranscript: ContentPart = { type: "text", text: `${WATCH_PROMPT}\nThe video's captions (what is said, with times):\n${text || "no captions"}` };
    const original: ContentPart = { type: "video_url", video_url: { url: dataUrl(file.bytes) } };
    const glm = file.bytes.byteLength <= GLM_MAX_ORIGINAL_BYTES;
    const done = await Promise.all([
      call(llm, v.id, "qwen-small", VIDEO_MODELS.primary, [prompt, { type: "video_url", video_url: { url: dataUrl(small) } }], MODEL_MAX_TOKENS),
      ...(glm
        ? [call(llm, v.id, "glm-original", VIDEO_MODELS.fallback, [prompt, original], GLM_MAX_TOKENS), call(llm, v.id, "glm-original-transcript", VIDEO_MODELS.fallback, [withTranscript, original], GLM_MAX_TOKENS)]
        : []),
    ]);
    const meta = { video: v.id, author: v.author, seconds, originalBytes: file.bytes.byteLength, smallBytes: small?.byteLength ?? 0, spokenHook: v.spokenHook };
    writeFileSync(`${path}/${v.id}-meta.json`, JSON.stringify(meta, null, 2));
    records.push(...done);
    for (const r of done) console.log(`${v.id} ${seconds.toFixed(0)}s ${r.variant}: ${(r.ms / 1000).toFixed(0)}s, ${r.completionTokens ?? "?"} tokens, $${(r.costUsd ?? 0).toFixed(6)}${r.error ? `, error ${r.error}` : ""}`);
  });
  writeFileSync(`${path}/calls.json`, JSON.stringify(records, null, 2));
  console.log(`data spent $${budget.spentUsd.toFixed(4)}; model billed $${records.reduce((s, r) => s + (r.costUsd ?? 0), 0).toFixed(4)}`);
  return path;
}
