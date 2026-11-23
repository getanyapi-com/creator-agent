import type { CreatorRow } from "../evidence.ts";
import { listRows, toCreatorRow, toVideoRow } from "../ingest.ts";
import { creatorFigures, daysAgo } from "../metrics.ts";
import { checkLabel } from "../finish/checks.ts";
import { cleanText, wrapData } from "../untrusted.ts";
import { handleArg, type Args } from "./args.ts";
import { budgetError, type ToolContext, type ToolResult } from "./context.ts";
import { followerMisses, hasFollowerCheck, toolChecks } from "./toolChecks.ts";

/** Bio length shown to the model, as in the loop proof (`loop.py`, 140). */
export const BIO_CHARS = 140;
const CAPTION_CHARS = 120;

/** What a ruled-out creator who misses only one of the question's limits may still be (close matches, 2026-11-22). */
export const CLOSE_HINT =
  "outside only this one of the question's limits: if a video of theirs you already saw is on the question's topic and meets its other limits, you may name them in finish's close list at no cost";

type Profile = { ok: true; creator: CreatorRow } | { ok: false; result: ToolResult };

/** The creator's profile: the one already read this run (by a search or an earlier inspection), or `tiktok.profile`. */
async function readProfile(ctx: ToolContext, handle: string): Promise<Profile> {
  const known = ctx.store.getCreator(handle);
  if (known) return { ok: true, creator: known };
  const profile = await ctx.anyapi.run("tiktok.profile", { handle });
  if (!profile.ok) return { ok: false, result: profile.refused ? budgetError(profile.error) : { handle, error: profile.error } };
  const creator = profile.data ? toCreatorRow(profile.data, handle, ctx.contacts, []) : null;
  if (!creator) return { ok: false, result: { handle, error: "creator not found" } };
  ctx.store.putCreator(creator);
  return { ok: true, creator };
}

/**
 * One creator: `tiktok.profile` first, then `tiktok.profile_videos` only when the profile does not
 * already rule the creator out on a follower check: the question's own (F1) or one the model assumes (round 4, D1).
 * A creator ruled out is returned as such, with the follower count as evidence. With no follower
 * check the two calls run together, as before; a profile already read this run is not bought again.
 */
export async function inspectCreator(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const handle = handleArg(args);
  const { checks, ignored } = toolChecks(ctx, args);
  ctx.lookedFor.add(handle);
  const sizeFirst = hasFollowerCheck(checks);
  const postsCall = sizeFirst || ctx.store.getCreator(handle) ? null : ctx.anyapi.run("tiktok.profile_videos", { handle });
  const profile = await readProfile(ctx, handle);
  if (!profile.ok) return profile.result;
  const misses = followerMisses(profile.creator.followers, checks);
  if (misses.length) {
    return {
      evidence_id: `@${profile.creator.handle}`,
      handle: profile.creator.handle,
      followers: profile.creator.followers,
      has_public_email: profile.creator.hasPublicEmail,
      ruled_out: `outside the follower checks (${misses.map(checkLabel).join("; ")}); its posts were not bought`,
      ...(misses.filter((c) => c.from === "question").length === 1 ? { close_match: CLOSE_HINT } : {}),
    };
  }
  let creator = profile.creator;
  let postListError: string | undefined;
  if (creator.sampledVideoIds.length === 0) {
    const posts = await (postsCall ?? ctx.anyapi.run("tiktok.profile_videos", { handle }));
    if (posts.ok) {
      const sampled = listRows(posts.data).flatMap((raw) => {
        const row = toVideoRow(raw, null, ctx.contacts);
        return row && row.author === creator.handle ? [ctx.store.putVideo(row).id] : [];
      });
      creator = { ...creator, sampledVideoIds: sampled };
      ctx.store.putCreator(creator);
    } else {
      postListError = posts.error;
    }
  }
  return { ...summary(ctx, creator), post_list_error: postListError, checks_ignored: ignored.length ? ignored : undefined };
}

function summary(ctx: ToolContext, creator: CreatorRow): ToolResult {
  const f = creatorFigures(ctx.store, creator);
  return {
    evidence_id: `@${creator.handle}`,
    handle: creator.handle,
    followers: f.followers,
    bio: wrapData(cleanText(creator.bio, BIO_CHARS, () => undefined)),
    has_public_email: creator.hasPublicEmail,
    posts_sampled: f.postsSampled,
    usual_views: f.usualViews,
    best_recent_post: f.best && {
      id: f.best.id,
      views: f.best.views,
      days_ago: daysAgo(f.best.createdUtc, ctx.nowSec),
      caption: wrapData(cleanText(f.best.caption, CAPTION_CHARS, () => undefined)),
    },
    posts_per_week: f.postsPerWeek,
    share_of_recent_posts_with_paid_label: f.paidShare,
  };
}
