import type { CreatorRow, EvidenceStore, VideoRow } from "./evidence.ts";

const DAY_SECONDS = 86_400;
/** "Usual views" is the median of the creator's last 10 non-pinned posts (spec, inspect_creator). */
const USUAL_SAMPLE = 10;

export function daysAgo(createdUtc: number | null, nowSec: number): number | null {
  return createdUtc === null ? null : Math.max(0, Math.floor((nowSec - createdUtc) / DAY_SECONDS));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round(value ?? 0);
}

/** The creator's last non-pinned posts, newest first, from the post list the code sampled. */
export function recentPosts(store: EvidenceStore, creator: CreatorRow): VideoRow[] {
  return creator.sampledVideoIds
    .map((id) => store.getVideo(id))
    .filter((v): v is VideoRow => v !== undefined && v.isPinned !== true && v.createdUtc !== null)
    .sort((a, b) => (b.createdUtc ?? 0) - (a.createdUtc ?? 0))
    .slice(0, USUAL_SAMPLE);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface CreatorFigures {
  followers: number | null;
  postsSampled: number;
  usualViews: number | null;
  best: VideoRow | null;
  postsPerWeek: number | null;
  paidShare: number | null;
}

/** Every figure the agent or the answer shows about a creator, computed once from evidence. */
export function creatorFigures(store: EvidenceStore, creator: CreatorRow): CreatorFigures {
  const posts = recentPosts(store, creator);
  const withViews = posts.filter((p) => p.views !== null);
  const best = withViews.reduce<VideoRow | null>((top, p) => (top && (top.views ?? 0) >= (p.views ?? 0) ? top : p), null);
  const labelled = posts.filter((p) => p.paidLabel !== null);
  return {
    followers: creator.followers,
    postsSampled: posts.length,
    usualViews: median(withViews.map((p) => p.views ?? 0)),
    best,
    postsPerWeek: postsPerWeek(posts),
    paidShare: labelled.length ? round1(labelled.filter((p) => p.paidLabel).length / labelled.length) : null,
  };
}

function postsPerWeek(posts: VideoRow[]): number | null {
  if (posts.length < 2) return null;
  const newest = posts[0]?.createdUtc ?? 0;
  const oldest = posts[posts.length - 1]?.createdUtc ?? 0;
  const weeks = (newest - oldest) / (7 * DAY_SECONDS);
  return weeks > 0 ? round1((posts.length - 1) / weeks) : null;
}

/** Best views over usual views; how far a post broke out of the creator's normal reach. */
export function breakoutRatio(bestViews: number | null, usualViews: number | null): number | null {
  if (bestViews === null || usualViews === null) return null;
  return round1(bestViews / Math.max(usualViews, 1));
}
