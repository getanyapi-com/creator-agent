import type { EvidenceStore, VideoRow } from "../evidence.ts";
import { breakoutRatio, creatorFigures, daysAgo, recentPosts } from "../metrics.ts";
import { BIO_CHARS } from "../tools/inspectCreator.ts";
import { TOOL_TEXT_CHARS } from "../tools/readTranscript.ts";
import { CAPTION_CHARS } from "../tools/searchVideos.ts";
import { clip, wrapData } from "../untrusted.ts";
import { checkLabel } from "./checks.ts";
import { captionText, watchText } from "./evidenceText.ts";
import type { FinishArgs } from "./parse.ts";

/**
 * The evidence a careful reader uses to judge a claim about one creator or one video (round 5): what
 * TikTok shows (bio, captions, what is said, what the video model saw) and what the code computed from
 * it (followers, usual views, how far a video is above them, how many days ago it was posted, the
 * paid label, whether a public email was found, and the checks the code applied with their results).
 */
export interface SubjectContext {
  store: EvidenceStore;
  nowSec: number;
  /** Per creator, the checks the code decided on them, in plain words with the result. */
  checks: Map<string, { check: string; result: string }[]>;
  /** Videos given in full (caption, what is said and seen): proof videos, cited and named ones. */
  detailed: Set<string>;
}

type Digest = Record<string, unknown>;

const tiktokText = (t: string | null | undefined, chars: number): string => wrapData(clip(t ?? "", chars));

/** A transcript without its WEBVTT header and cue timings, which carry no claim and fill the request. */
function spoken(text: string | null | undefined): string {
  return (text ?? "").replace(/^WEBVTT\s*/, "").replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/g, " ").replace(/\s+/g, " ").trim();
}

function usualViewsOf(ctx: SubjectContext, handle: string): number | null {
  const c = ctx.store.getCreator(handle);
  return c ? creatorFigures(ctx.store, c).usualViews : null;
}

/** One video: its figures always, and in full its caption, what is said and what was seen. */
export function videoDigest(ctx: SubjectContext, v: VideoRow): Digest {
  const full = ctx.detailed.has(v.id);
  const base: Digest = {
    id: v.id,
    creator: `@${v.author}`,
    views: v.views,
    times_creators_usual_views: breakoutRatio(v.views, usualViewsOf(ctx, v.author)),
    days_ago: daysAgo(v.createdUtc, ctx.nowSec),
    region: v.region,
    paid_label: v.paidLabel,
    found_in_search: v.foundBy.length > 0,
    caption: tiktokText(captionText(v), full ? TOOL_TEXT_CHARS : CAPTION_CHARS),
  };
  if (!full) return base;
  const said = spoken(ctx.store.getTranscript(v.id)?.text);
  const w = ctx.store.getWatch(v.id);
  return { ...base, ...(said ? { said: tiktokText(said, TOOL_TEXT_CHARS) } : {}), ...(w ? { seen: tiktokText(watchText(w), TOOL_TEXT_CHARS) } : {}) };
}

/**
 * One creator: the profile figures the code computed, the checks it applied, the bio, and their
 * videos a reader would weigh: those given in full, the recent posts the usual views are the median
 * of, and those the searches found.
 */
export function creatorDigest(ctx: SubjectContext, handle: string): Digest {
  const c = ctx.store.getCreator(handle);
  const recent = new Set(c ? recentPosts(ctx.store, c).map((v) => v.id) : []);
  const videos = ctx.store.videosBy(handle).filter((v) => ctx.detailed.has(v.id) || recent.has(v.id) || v.foundBy.length > 0).map((v) => videoDigest(ctx, v));
  if (!c) return { handle: `@${handle}`, profile_read: false, videos };
  const f = creatorFigures(ctx.store, c);
  return {
    handle: `@${handle}`,
    followers: c.followers,
    usual_views: f.usualViews,
    best_recent_views: f.best?.views ?? null,
    posts_per_week: f.postsPerWeek,
    share_of_recent_posts_with_paid_label: f.paidShare,
    has_public_email: c.hasPublicEmail,
    bio: tiktokText(c.bio, BIO_CHARS),
    checks_applied_by_code: ctx.checks.get(handle) ?? [],
    videos,
  };
}

/** Video ids an evidence id points at: `t:<id>`, `w:<id>` or a bare id. */
const videoIdOf = (evidenceId: string): string | null => /^(?:[tw]:)?(\d+)$/.exec(evidenceId.trim())?.[1] ?? null;

/** Every video id a text names: a TikTok link's id or a bare long id. */
export const videoIdsIn = (text: string): string[] => [...text.matchAll(/(?<!\d)(\d{15,21})(?!\d)/g)].map((m) => m[1] ?? "");

/** The context for one finish: proof, cited and named videos in full, and each creator's checks as the code decided them. */
export function subjectContext(store: EvidenceStore, args: FinishArgs, nowSec: number, question: string): SubjectContext {
  const checks = new Map(
    args.creators.map((c) => [c.handle, c.criteria.filter((k) => k.check).map((k) => ({ check: k.criterion, result: k.state === "supported" ? "passes" : k.state === "contradicted" ? "fails" : "unknown" }))]),
  );
  const detailed = new Set([
    ...args.creators.flatMap((c) => [c.proof_video_id, ...c.criteria.flatMap((k) => (k.evidence_id ? [videoIdOf(k.evidence_id)] : []))]),
    ...args.videos.map((v) => v.video_id),
    ...args.patterns.flatMap((p) => p.video_ids),
    ...args.sections.flatMap((s) => s.members),
    ...videoIdsIn(question),
  ].filter((id): id is string => typeof id === "string" && store.getVideo(id) !== undefined));
  return { store, nowSec, checks, detailed };
}

/** The checks every creator of the answer was held to, in plain words, each marked as the question's or assumed. */
export function checksDigest(args: FinishArgs): string[] {
  return args.checks.map((c) => `${checkLabel(c)} (${c.from === "question" ? "the question's" : "assumed"})`);
}
