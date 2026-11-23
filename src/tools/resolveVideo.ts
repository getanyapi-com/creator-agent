import type { RunResult } from "../anyapi.ts";
import type { VideoRow } from "../evidence.ts";
import { toVideoRow } from "../ingest.ts";
import { videoArg, type Args } from "./args.ts";
import type { ToolContext } from "./context.ts";

export type Resolved = { ok: true; video: VideoRow } | { ok: false; failure: Extract<RunResult, { ok: false }> };

/** Finds a video in evidence, or fetches it with `tiktok.video` when the model names one not seen yet. */
export async function resolveVideo(ctx: ToolContext, args: Args): Promise<Resolved> {
  const ref = videoArg(args);
  const known = ctx.store.getVideo(ref.id);
  if (known) return { ok: true, video: known };
  const input = ref.author ? { url: `https://www.tiktok.com/@${ref.author}/video/${ref.id}` } : { id: ref.id };
  const res = await ctx.anyapi.run("tiktok.video", input);
  if (!res.ok) return { ok: false, failure: res };
  const row = res.data ? toVideoRow(res.data, null, ctx.contacts) : null;
  if (!row) return { ok: false, failure: { ok: false, refused: false, error: "video not found" } };
  return { ok: true, video: ctx.store.putVideo(row) };
}
