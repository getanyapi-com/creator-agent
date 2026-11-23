import { parseChecks, type Check } from "../finish/checks.ts";
import type { VideoRow } from "../evidence.ts";
import { withQuestionChecks } from "../intake/merge.ts";
import { daysAgo } from "../metrics.ts";
import type { Args } from "./args.ts";
import type { ToolContext } from "./context.ts";

/**
 * The checks a research tool applies before it buys more evidence (round 4, D1, D2 and F1): the
 * question's own checks from the intake step, which the model neither passes nor changes, plus any
 * checks the model passes for kinds the question does not state (its assumptions). When the intake
 * step failed, the checks the model passes are all there is. A check that cannot be read is ignored
 * and named in `ignored`.
 */
export interface ToolChecks {
  checks: Check[];
  ignored: string[];
}

export function toolChecks(ctx: ToolContext, args: Args): ToolChecks {
  const { checks, problems } = parseChecks(args.checks);
  return { checks: withQuestionChecks(ctx.questionChecks, checks), ignored: problems };
}

/** The follower checks a creator's count misses; empty when it meets them or the count is unknown. */
export function followerMisses(followers: number | null, checks: Check[]): Check[] {
  if (followers === null) return [];
  return checks.filter((c) => (c.kind === "followers_at_most" && followers > Number(c.value)) || (c.kind === "followers_at_least" && followers < Number(c.value)));
}

export function hasFollowerCheck(checks: Check[]): boolean {
  return checks.some((c) => c.kind === "followers_at_most" || c.kind === "followers_at_least");
}

/** What a search row settles: which check it already misses on views, recency or region; null when none or unknown. */
export type RowMiss = "views" | "recency" | "region";

export function rowMiss(v: VideoRow, checks: Check[], nowSec: number): RowMiss | null {
  for (const c of checks) {
    if (c.kind === "proof_views_at_least" && v.views !== null && v.views < Number(c.value)) return "views";
    const age = daysAgo(v.createdUtc, nowSec);
    if (c.kind === "proof_posted_within_days" && age !== null && age > Number(c.value)) return "recency";
    if (c.kind === "proof_region" && v.region !== null && v.region !== c.value) return "region";
  }
  return null;
}
