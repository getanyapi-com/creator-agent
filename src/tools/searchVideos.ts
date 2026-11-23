import type { VideoRow } from "../evidence.ts";
import { listRows, toVideoRow } from "../ingest.ts";
import { daysAgo } from "../metrics.ts";
import { cleanText, wrapData } from "../untrusted.ts";
import { daysArg, queryArg, sortArg, type Args } from "./args.ts";
import { budgetError, type ToolContext, type ToolResult } from "./context.ts";
import { rowMiss, toolChecks, type RowMiss } from "./toolChecks.ts";

/** Caption length shown to the model (spec: "cleaned caption (120 chars)"). */
export const CAPTION_CHARS = 120;
/** Rows shown per search, as in the loop proof (`loop.py`, 14), highest views first. */
const ROWS_SHOWN = 14;

export function videoForModel(v: VideoRow, nowSec: number): ToolResult {
  return {
    id: v.id,
    creator: `@${v.author}`,
    views: v.views,
    country_of_video: v.region,
    days_ago: daysAgo(v.createdUtc, nowSec),
    paid_label: v.paidLabel,
    caption: wrapData(cleanText(v.caption, CAPTION_CHARS, () => undefined)),
    found_by: v.foundBy,
  };
}

type LeftOut = Record<RowMiss, number>;

/**
 * The rows to show: those that miss no check a search row settles (views, recency, region), highest
 * views first. Buying each creator's profile here as well (round 4, D2) was measured and not kept.
 */
function rowsInRange(ctx: ToolContext, fresh: VideoRow[], args: Args): { shown: VideoRow[]; leftOut: LeftOut; ignored: string[] } {
  const { checks, ignored } = toolChecks(ctx, args);
  const leftOut: LeftOut = { views: 0, recency: 0, region: 0 };
  const passing = fresh.filter((v) => {
    const miss = rowMiss(v, checks, ctx.nowSec);
    if (miss) leftOut[miss] += 1;
    return miss === null;
  });
  passing.sort((a, b) => (b.views ?? -1) - (a.views ?? -1));
  return { shown: passing.slice(0, ROWS_SHOWN), leftOut, ignored };
}

/**
 * One `tiktok.search_keyword` page; asking the same search again fetches its next page. Rows that
 * already miss a check of the question's (or one the model assumes) on views, recency or region are
 * left out and counted (round 4, D2 and F1).
 */
export async function searchVideos(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const query = queryArg(args);
  const sort = sortArg(args);
  const days = daysArg(args);
  const key = `${query.toLowerCase()}|${sort}|${days}`;
  const cursor = ctx.searchCursors.get(key);
  if (cursor === null) return { query, error: "no more pages for this search" };
  const input: Args = { query, sortBy: sort, datePosted: days };
  if (cursor) input.cursor = cursor;
  const res = await ctx.anyapi.run("tiktok.search_keyword", input);
  if (!res.ok) return res.refused ? budgetError(res.error) : { query, error: res.error };
  const next = res.data?.nextCursor;
  ctx.searchCursors.set(key, typeof next === "string" && next ? next : null);
  const fresh: VideoRow[] = [];
  let seenBefore = 0;
  for (const raw of listRows(res.data)) {
    const row = toVideoRow(raw, query, ctx.contacts);
    if (!row) continue;
    const stored = ctx.store.putVideo(row);
    if (ctx.shownVideos.has(stored.id)) seenBefore += 1;
    else if (!fresh.some((v) => v.id === stored.id)) fresh.push(stored);
  }
  const { shown, leftOut, ignored } = rowsInRange(ctx, fresh, args);
  shown.forEach((v) => ctx.shownVideos.add(v.id));
  const leftOutTotal = Object.values(leftOut).reduce((a, b) => a + b, 0);
  return {
    query,
    sort,
    days,
    videos: shown.map((v) => videoForModel(v, ctx.nowSec)),
    new_videos: fresh.length,
    not_shown: fresh.length - leftOutTotal - shown.length,
    left_out_by_checks: leftOutTotal ? leftOut : undefined,
    checks_ignored: ignored.length ? ignored : undefined,
    already_seen: seenBefore,
    more_pages: ctx.searchCursors.get(key) !== null,
  };
}
