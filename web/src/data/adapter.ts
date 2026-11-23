import type { DisplayCloseCreator, DisplayCreator, DisplayCriterion, DisplayRun, DisplaySection, DisplayVideo } from "@/server/live/displayTypes";
import type { WalletStop } from "@/server/wallet/walletFetch";
import { replaySteps } from "./steps";
import type { CreatorView, CriterionView, EvidenceView, PatternView, SectionView, ThreadView, Tier, VideoView } from "./types";

/** One thread's display object, when and on which tier it was asked, and the app's saved copies of its images. */
export interface ThreadSource {
  id: string;
  askedAt: string | null;
  tier: Tier;
  walletStop: WalletStop | null;
  display: DisplayRun;
  /** The URL of a saved image by name (avatar-<handle> or video-<id>), when one was saved. */
  media: (name: string) => string | undefined;
}

interface Context {
  /** True when the core's contact check fell back to its pattern cleaner and left captions and excerpts out. */
  patternsOnly: boolean;
  media: ThreadSource["media"];
  evidence: Record<string, EvidenceView>;
}

function videoUrl(creator: string, id: string): string {
  return creator === "" ? `https://www.tiktok.com/video/${id}` : `https://www.tiktok.com/@${creator}/video/${id}`;
}

function toVideo(v: DisplayVideo, ctx: Context): VideoView {
  return {
    id: v.id,
    url: v.url,
    creator: v.creator,
    views: v.views,
    postedUtc: v.postedUtc,
    region: v.region,
    paidLabel: v.paidLabel,
    caption: v.caption,
    captionOnTikTok: v.caption === null && ctx.patternsOnly,
    thumbnailUrl: ctx.media(`video-${v.id}`),
  };
}

/** A video the display object names by id only (a pattern's video it carries no row for): a link to it and a saved cover, if any. */
function bareVideo(id: string, ctx: Context): VideoView {
  return {
    id,
    url: videoUrl("", id),
    creator: "",
    views: null,
    postedUtc: null,
    region: null,
    paidLabel: null,
    caption: null,
    captionOnTikTok: false,
    thumbnailUrl: ctx.media(`video-${id}`),
  };
}

/** A criterion, with its evidence filed in the thread's evidence under an id of its own. */
function toCriterion(k: DisplayCriterion, ctx: Context): CriterionView {
  if (k.evidence === null) return { text: k.text, state: k.state, evidenceId: null };
  const evidenceId = `e${Object.keys(ctx.evidence).length}`;
  ctx.evidence[evidenceId] = { kind: k.evidence.kind, url: k.evidence.url, excerpt: k.evidence.excerpt };
  return { text: k.text, state: k.state, evidenceId };
}

function toCreator(c: DisplayCreator, ctx: Context): CreatorView {
  return {
    handle: c.handle,
    profileUrl: c.profileUrl,
    avatarUrl: ctx.media(`avatar-${c.handle}`),
    followers: c.followers,
    usualViews: c.usualViews,
    postsSampled: c.postsSampled,
    postsPerWeek: c.postsPerWeek,
    proofVsUsualRatio: c.proofVsUsualRatio,
    hasPublicEmail: c.hasPublicEmail,
    proof: toVideo(c.proofVideo, ctx),
    criteria: c.criteria.map((k) => toCriterion(k, ctx)),
  };
}

/** The heading of the section of close creators, which follows the answer's own sections. */
export const CLOSE_HEADING = "Close, but outside one limit";

/** The close creators as one section after the answer's own, each with the limit it misses; null when there are none (and for a thread saved before they existed). */
function toClose(close: DisplayCloseCreator[] | undefined, ctx: Context): SectionView | null {
  if (close === undefined || close.length === 0) return null;
  return { kind: "group", heading: CLOSE_HEADING, reason: null, creators: close.map((c) => ({ ...toCreator(c, ctx), missed: c.missed })), videos: [] };
}

/** A section as the core wrote it, its creators the same views as the thread's own. */
function toSection(s: DisplaySection, creators: Map<string, CreatorView>, video: (id: string) => VideoView): SectionView {
  return { kind: s.kind, heading: s.heading, reason: s.reason, creators: s.creators.flatMap((c) => creators.get(c.handle) ?? []), videos: s.videos.map((v) => video(v.id)) };
}

/**
 * Turns the core's display object into the thread view model the pages render. This is the
 * only input the view model has; the display object is all a browser may receive about a run.
 */
export function toThread({ id, askedAt, tier, walletStop, display: d, media }: ThreadSource): ThreadView {
  const ctx: Context = { patternsOnly: d.gate === "patterns", media, evidence: {} };
  const videos = new Map<string, VideoView>();
  for (const v of [...d.creators.map((c) => c.proofVideo), ...d.videos, ...d.sections.flatMap((s) => s.videos)]) if (!videos.has(v.id)) videos.set(v.id, toVideo(v, ctx));
  const video = (videoId: string): VideoView => videos.get(videoId) ?? bareVideo(videoId, ctx);
  const creators = d.creators.map((c) => toCreator(c, ctx));
  const patterns: PatternView[] = d.patterns.map((p) => ({ text: p.text, videos: p.videoIds.map(video) }));
  const byHandle = new Map(creators.map((c) => [c.handle, c]));
  return {
    id,
    question: d.question,
    tier,
    askedAt,
    walletStop,
    finishedBy: d.finishedBy,
    answer: d.answer,
    criteriaLine: d.criteriaLine,
    creators,
    sections: d.sections.map((s) => toSection(s, byHandle, video)),
    close: toClose(d.close, ctx),
    patterns,
    assumptions: d.assumptions,
    limits: d.limitsSentences,
    budgetNote: d.budgetNote,
    notFound: d.notFound,
    cost: { limitUsd: d.cost.limitUsd, totalUsd: d.cost.totalUsd, dataCalls: d.cost.dataCalls, modelTurns: d.cost.modelTurns, wallMs: d.cost.wallMs },
    steps: replaySteps(d.steps, d.cost.totalUsd),
    evidence: ctx.evidence,
  };
}
