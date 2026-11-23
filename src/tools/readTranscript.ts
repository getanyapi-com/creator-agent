import { cleanText, wrapData } from "../untrusted.ts";
import type { Args } from "./args.ts";
import { budgetError, type ToolContext, type ToolResult } from "./context.ts";
import { resolveVideo } from "./resolveVideo.ts";

/** Longest tool text shown to the model, the cap the loop proof used (`loop.py`, 6000). */
export const TOOL_TEXT_CHARS = 6000;

/** `tiktok.video_transcript` on the transcript source: the spoken text, or "no captions". */
export async function readTranscript(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const resolved = await resolveVideo(ctx, args);
  if (!resolved.ok) return resolved.failure.refused ? budgetError(resolved.failure.error) : { error: resolved.failure.error };
  const video = resolved.video;
  const cached = ctx.store.getTranscript(video.id);
  let text = cached ? cached.text : null;
  if (!cached) {
    const res = await ctx.anyapi.run("tiktok.video_transcript", { url: video.url });
    if (!res.ok) return res.refused ? budgetError(res.error) : { video: video.id, error: res.error };
    const raw = typeof res.data?.transcript === "string" ? res.data.transcript : "";
    text = cleanText(raw, Infinity, (found) => ctx.contacts.add(video.author, found, "transcript")) || null;
    ctx.store.putTranscript({ videoId: video.id, text });
  }
  return {
    evidence_id: `t:${video.id}`,
    video: video.id,
    creator: `@${video.author}`,
    transcript: text ? wrapData(cleanText(text, TOOL_TEXT_CHARS, () => undefined)) : "no captions",
  };
}
