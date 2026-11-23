import { describe, expect, it } from "vitest";
import { contactsIn } from "../bench/score/contactDetector.ts";
import { runAgent } from "../src/agent.ts";
import { Budget } from "../src/budget.ts";
import { MemoryContactStore } from "../src/contactStore.ts";
import type { VideoRow } from "../src/evidence.ts";
import type { ChatModel, ChatRequest, Completion } from "../src/llm.ts";
import { GLM_VIDEO_TOKENS_PER_SECOND, QWEN_OUTPUT_HOLD_TOKENS, QWEN_VIDEO_TOKENS_PER_SECOND, videoBoundUsd } from "../src/modelCost.ts";
import { cleanWatch, watchForModel } from "../src/tools/inspectVideo.ts";
import { fakeAnyApi, ScriptedModel, searchRow, services, toolCall } from "./fakes.ts";
import { fetchVideoFile } from "../src/video/fetchVideo.ts";
import { MAX_ORIGINAL_BYTES, MAX_WATCH_SECONDS } from "../src/video/limits.ts";
import { GLM_VIDEO_MAX_TOKENS, QWEN_TIMEOUT_MS, WATCH_PROMPT, watchVideo } from "../src/video/watch.ts";

describe("fetchVideoFile", () => {
  const file = (bytes: number, headers: Record<string, string> = {}) => new Response(new Uint8Array(bytes), { status: 200, headers });

  it("fetches from a TikTok media host over https", async () => {
    const seen: string[] = [];
    const res = await fetchVideoFile("https://v16m.tiktokcdn-us.com/a.mp4", async (url) => {
      seen.push(String(url));
      return file(10);
    });
    expect(res).toMatchObject({ ok: true });
    expect(seen).toEqual(["https://v16m.tiktokcdn-us.com/a.mp4"]);
  });

  it("refuses any other host, plain http, or a lookalike domain, without fetching", async () => {
    let fetched = 0;
    const count = async () => {
      fetched += 1;
      return file(10);
    };
    for (const url of ["https://evil.example/a.mp4", "http://v16m.tiktokcdn-us.com/a.mp4", "https://tiktokcdn-us.com.evil.io/a.mp4", "https://eviltiktokcdn.com/a", "https://169.254.169.254/latest"]) {
      expect((await fetchVideoFile(url, count)).ok).toBe(false);
    }
    expect(fetched).toBe(0);
  });

  it("follows a redirect to another media host but refuses one to any other host", async () => {
    const hop = (to: string) => new Response(null, { status: 302, headers: { location: to } });
    const ok = await fetchVideoFile("https://v16.tokcdn.com/a", async (url) => (new URL(String(url)).hostname === "v16.tokcdn.com" ? hop("https://v16m.tiktokcdn-us.com/b") : file(10)));
    expect(ok.ok).toBe(true);
    const seen: string[] = [];
    const bad = await fetchVideoFile("https://v16.tokcdn.com/a", async (url) => {
      seen.push(String(url));
      return hop("http://169.254.169.254/latest/meta-data");
    });
    expect(bad).toEqual({ ok: false, error: "the file is not on a TikTok media host" });
    expect(seen).toHaveLength(1);
  });

  it("takes an original over the old 7 MB limit, which only the removed path needed (round 4, D4)", async () => {
    expect(await fetchVideoFile("https://v16m.tiktokcdn-us.com/a", async () => file(8_000_000))).toMatchObject({ ok: true });
    expect(MAX_ORIGINAL_BYTES).toBe(186_612 * MAX_WATCH_SECONDS);
  });

  it("refuses a file larger than the downscale step needs, by its header or by what arrives, marked as too large", async () => {
    const declared = await fetchVideoFile("https://v16m.tiktokcdn-us.com/a", async () => file(10, { "content-length": String(MAX_ORIGINAL_BYTES + 1) }));
    expect(declared.ok).toBe(false);
    const streamed = await fetchVideoFile("https://v16m.tiktokcdn-us.com/a", async () => file(MAX_ORIGINAL_BYTES + 1));
    expect(streamed).toMatchObject({ ok: false, tooLarge: true });
    expect(contactsIn(JSON.stringify([declared, streamed]))).toEqual([]);
  });

  it("asks the fetch to time out", async () => {
    let signal: AbortSignal | null | undefined;
    await fetchVideoFile("https://v16m.tiktokcdn-us.com/a", async (_url, init) => {
      signal = init?.signal;
      return file(1);
    });
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

class VideoModel implements ChatModel {
  readonly calls: string[] = [];
  readonly #replies: Record<string, string | Error>;
  readonly #costUsd: number;

  readonly #promptTokens: Record<string, number>;

  constructor(replies: Record<string, string | Error>, costUsd = 0.000004, promptTokens: Record<string, number> = {}) {
    this.#replies = replies;
    this.#costUsd = costUsd;
    this.#promptTokens = promptTokens;
  }

  async complete(model: string, request: ChatRequest): Promise<Completion> {
    const part = (request.messages[0]?.content as { type: string }[])[1];
    this.calls.push(`${model} ${part?.type ?? ""} ${request.timeoutMs}`);
    const reply = this.#replies[model] ?? "";
    if (reply instanceof Error) throw reply;
    return { content: reply, toolCalls: [], costUsd: this.#costUsd, finishReason: "stop", promptTokens: this.#promptTokens[model] ?? null };
  }
}

const prices = { q: { promptUsd: 1.5e-7, completionUsd: 4.7e-7 }, g: { promptUsd: 1.2e-7, completionUsd: 4.75e-7 } };
const models = { primary: "q", fallback: "g" };
const watchJson = JSON.stringify({ observations: [{ at: "0:00", what: "a desk" }], on_screen_text: [], looked_at: "the video", hypothesis: "a guess" });

function counted(bytes: Uint8Array | null) {
  const made = { count: 0 };
  return { made, downscale: async () => ((made.count += 1), bytes) };
}

describe("watchVideo", () => {
  it("bounds each video call before it runs from the video's length and refuses one that does not fit", async () => {
    const qwen = videoBoundUsd(prices, "q", 500, 60, QWEN_OUTPUT_HOLD_TOKENS, QWEN_VIDEO_TOKENS_PER_SECOND);
    expect(qwen).toBeGreaterThan(0.4 * (255 * 60 * 1.5e-7 + 12_159 * 4.7e-7));
    const llm = new VideoModel({ g: watchJson, q: watchJson });
    const budget = new Budget(qwen / 2);
    const out = await watchVideo({ llm, budget, prices, original: new Uint8Array(10), ...counted(new Uint8Array(5)), seconds: 60, models });
    expect(out).toMatchObject({ error: expect.stringContaining("budget has no room") });
    expect(llm.calls).toEqual([]);
    expect(budget.spentUsd).toBe(0);
  });

  it("has Qwen watch the downscaled copy first, waited for up to its limit, and settles at the billed cost", async () => {
    const llm = new VideoModel({ g: watchJson, q: watchJson });
    const budget = new Budget(1);
    const out = await watchVideo({ llm, budget, prices, original: new Uint8Array(10), ...counted(new Uint8Array(5)), seconds: 30, models });
    expect(out).toMatchObject({ model: "q", fallbackReason: null });
    expect(llm.calls).toEqual([`q video_url ${QWEN_TIMEOUT_MS}`]);
    expect(budget.modelUsd).toBeCloseTo(0.000004, 12);
  });

  it("has GLM watch the original as a video part only when Qwen fails, and records which model watched and why", async () => {
    const llm = new VideoModel({ q: new Error("timed out"), g: watchJson });
    const out = await watchVideo({ llm, budget: new Budget(1), prices, original: new Uint8Array(10), ...counted(new Uint8Array(5)), seconds: 30, models });
    expect(out).toMatchObject({ model: "g", fallbackReason: expect.stringContaining("timed out") });
    expect(llm.calls.map((c) => c.split(" ").slice(0, 2).join(" "))).toEqual(["q video_url", "g video_url"]);
  });

  it("does not send an original larger than the video path takes to GLM", async () => {
    const llm = new VideoModel({ q: "not json", g: watchJson });
    const out = await watchVideo({ llm, budget: new Budget(1), prices, original: new Uint8Array(7_000_001), ...counted(new Uint8Array(5)), seconds: 30, models });
    expect(out).toMatchObject({ error: expect.stringContaining("not the JSON") });
    expect(llm.calls.map((c) => c.split(" ")[0])).toEqual(["q"]);
  });

  it("bounds the GLM fallback at its own measured rate of video tokens per second", async () => {
    const glm = videoBoundUsd(prices, "g", Buffer.byteLength(WATCH_PROMPT), 60, GLM_VIDEO_MAX_TOKENS, GLM_VIDEO_TOKENS_PER_SECOND);
    const llm = new VideoModel({ q: new Error("timed out"), g: watchJson });
    const budget = new Budget(1);
    await watchVideo({ llm, budget, prices, original: new Uint8Array(10), ...counted(new Uint8Array(5)), seconds: 60, models });
    expect(glm).toBeGreaterThan(0.4 * 1217 * 60 * 1.2e-7);
    const tight = new Budget(glm / 2);
    const refused = await watchVideo({ llm: new VideoModel({ q: new Error("timed out"), g: watchJson }), budget: tight, prices, original: new Uint8Array(10), ...counted(new Uint8Array(5)), seconds: 60, models });
    expect(refused).toMatchObject({ error: expect.stringContaining("budget has no room") });
  });

  it("treats a reply billed no video tokens as a failure: the model did not receive the video", async () => {
    const prompt = Buffer.byteLength(WATCH_PROMPT);
    const noVideo = JSON.stringify({ observations: [{ at: "0:00", what: "No video content was accessible." }] });
    const llm = new VideoModel({ q: new Error("timed out"), g: noVideo }, 0.000004, { g: 119 });
    const out = await watchVideo({ llm, budget: new Budget(1), prices, original: new Uint8Array(10), ...counted(new Uint8Array(5)), seconds: 30, models });
    expect(out).toMatchObject({ error: expect.stringContaining("did not receive the video") });
    const seen = new VideoModel({ q: watchJson }, 0.000004, { q: prompt + 6000 });
    expect(await watchVideo({ llm: seen, budget: new Budget(1), prices, original: new Uint8Array(10), ...counted(new Uint8Array(5)), seconds: 30, models })).toMatchObject({ model: "q" });
  });

  it("holds Qwen at the largest output measured and books anything billed above it as house cost, never the question's", async () => {
    const hold = videoBoundUsd(prices, "q", Buffer.byteLength(WATCH_PROMPT), 12, QWEN_OUTPUT_HOLD_TOKENS, QWEN_VIDEO_TOKENS_PER_SECOND);
    const llm = new VideoModel({ q: watchJson }, hold * 3);
    const budget = new Budget(hold * 1.5);
    const out = await watchVideo({ llm, budget, prices, original: new Uint8Array(10), ...counted(new Uint8Array(5)), seconds: 12, models });
    expect(out).toMatchObject({ model: "q" });
    expect(budget.spentUsd).toBeCloseTo(hold, 12);
    expect(budget.houseUsd).toBeCloseTo(hold * 2, 12);
    expect(budget.spentUsd).toBeLessThanOrEqual(budget.limitUsd);
  });
});

describe("inspect_video and the length Qwen was measured on (round 4, D4)", () => {
  it("reports a video longer than the longest measured as too long to watch, before downloading the file", async () => {
    const api = fakeAnyApi({
      "tiktok.search_keyword": () => ({ videos: [searchRow("721", "amber", 340)] }),
      "tiktok.video_download": () => ({ sdVideoUrl: "https://v16m.tiktokcdn-us.com/a.mp4", durationSeconds: MAX_WATCH_SECONDS + 1 }),
    });
    const model = new ScriptedModel([() => [toolCall("s", "search_videos", { query: "x" })], () => [toolCall("w", "inspect_video", { video: "721" })], () => [toolCall("f", "finish", { answer: "Done." })]]);
    const out = await runAgent("Find study creators", { kind: "free" }, services(api.make, model));
    expect(out.trace[1]?.toolCalls[0]?.result).toMatchObject({ too_long: true, error: "too long to watch" });
  });
});

describe("what the video model writes", () => {
  it("is cleaned before it is stored, shown or passed to the agent model", () => {
    const video = { id: "1", author: "ann" } as VideoRow;
    const contacts = new MemoryContactStore();
    const watched = {
      model: "q",
      fallbackReason: null,
      observations: [{ at: "0:01", what: "Text on screen: email ann@example.com or call 555 123 4567" }],
      onScreenText: [{ at: "0:02", what: "ig: annstudies | annstudies.com" }],
      lookedAt: "the video",
      hypothesis: "visit www.annstudies.net",
    };
    const row = cleanWatch(video, watched, contacts);
    const shown = watchForModel(row, video);
    expect(contactsIn(JSON.stringify(row))).toEqual([]);
    expect(contactsIn(JSON.stringify(shown))).toEqual([]);
    expect(contacts.count()).toBe(5);
    expect(contacts.hasEmail("ann")).toBe(true);
  });
});
