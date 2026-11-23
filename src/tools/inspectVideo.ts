import type { ContactStore } from "../contactStore.ts";
import type { Contact } from "../contacts.ts";
import type { Observation, VideoRow, WatchRow } from "../evidence.ts";
import { cleanText, wrapData } from "../untrusted.ts";
import { downscaleVideo } from "../video/downscale.ts";
import { fetchVideoFile } from "../video/fetchVideo.ts";
import { MAX_WATCH_SECONDS } from "../video/limits.ts";
import { probeSeconds } from "../video/probe.ts";
import { watchVideo, type WatchOutput } from "../video/watch.ts";
import type { Args } from "./args.ts";
import { budgetError, type ToolContext, type ToolResult } from "./context.ts";
import { resolveVideo } from "./resolveVideo.ts";

/** Downloads a video, has a video model watch it, and stores what it saw apart from why it worked. */
export async function inspectVideo(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const resolved = await resolveVideo(ctx, args);
  if (!resolved.ok) return resolved.failure.refused ? budgetError(resolved.failure.error) : { error: resolved.failure.error };
  const video = resolved.video;
  const cached = ctx.store.getWatch(video.id);
  if (cached) return watchForModel(cached, video);
  const download = await ctx.anyapi.run("tiktok.video_download", { url: video.url });
  if (!download.ok) return download.refused ? budgetError(download.error) : { video: video.id, error: download.error };
  const fileUrl = download.data?.sdVideoUrl ?? download.data?.videoUrl;
  if (typeof fileUrl !== "string") return { video: video.id, error: "no downloadable file (deleted, private or a photo post)" };
  const stated = numberOrNull(download.data?.durationSeconds) ?? video.durationSeconds;
  if (stated !== null && stated > MAX_WATCH_SECONDS) return tooLong(video);
  const file = await fetchVideoFile(fileUrl);
  if (!file.ok && file.tooLarge) return tooLong(video);
  if (!file.ok) return { video: video.id, error: file.error };
  const seconds = (await probeSeconds(file.bytes)) ?? numberOrNull(download.data?.durationSeconds);
  if (seconds === null) return { video: video.id, error: "the video's length is unknown, so its cost cannot be bounded" };
  if (seconds > MAX_WATCH_SECONDS) return tooLong(video);
  const watched = await watchVideo({
    llm: ctx.llm,
    budget: ctx.spend,
    prices: ctx.modelPrices,
    original: file.bytes,
    downscale: () => downscaleVideo(file.bytes),
    seconds,
    models: ctx.videoModels,
  });
  if ("error" in watched) return { video: video.id, error: `video models failed: ${watched.error}` };
  const row = cleanWatch(video, watched, ctx.contacts);
  ctx.store.putWatch(row);
  return watchForModel(row, video);
}

/** A video longer than the watcher was measured on, or too large to downscale (round 4, D4): its transcript is offered instead. */
function tooLong(video: VideoRow): ToolResult {
  return { video: video.id, error: "too long to watch", too_long: true, instead: "read_transcript gives what is said in it" };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** What the video model wrote, cleaned like TikTok text before it is stored, shown or passed to the agent. */
export function cleanWatch(video: VideoRow, watched: WatchOutput, contacts: ContactStore): WatchRow {
  const sink = (found: Contact[]): void => contacts.add(video.author, found, "video");
  const clean = (o: Observation): Observation => ({ at: cleanText(o.at, Infinity, sink), what: cleanText(o.what, Infinity, sink) });
  return {
    videoId: video.id,
    model: watched.model,
    fallbackReason: watched.fallbackReason === null ? null : cleanText(watched.fallbackReason, Infinity, sink),
    observations: watched.observations.map(clean),
    onScreenText: watched.onScreenText.map(clean),
    lookedAt: cleanText(watched.lookedAt, Infinity, sink),
    hypothesis: cleanText(watched.hypothesis, Infinity, sink),
  };
}

export function watchForModel(row: WatchRow, video: VideoRow): ToolResult {
  const show = (o: Observation): Observation => ({ at: o.at, what: wrapData(o.what) });
  return {
    evidence_id: `w:${row.videoId}`,
    video: row.videoId,
    creator: `@${video.author}`,
    watched_by: row.model,
    second_watcher: row.fallbackReason !== null,
    what_was_looked_at: wrapData(row.lookedAt),
    observations: row.observations.map(show),
    on_screen_text: row.onScreenText.map(show),
    hypothesis_not_evidence: wrapData(row.hypothesis),
  };
}
