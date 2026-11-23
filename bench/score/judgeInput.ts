import type { Answer, AnswerCreator } from "../../src/answer.ts";
import type { EvidenceSnapshot } from "../../src/evidence.ts";
import { clip } from "../../src/untrusted.ts";

/** Longest evidence text shown to the judge per row, the cap the agent's own tools use (`TOOL_TEXT_CHARS`). */
const TEXT_CHARS = 6000;

const text = (t: string | null | undefined): string => clip(t ?? "", TEXT_CHARS);

/** The ids a creator's claims cite, stripped of their `t:`/`w:` prefix. */
function citedIds(c: AnswerCreator): string[] {
  return [c.proofVideo.id, ...c.criteria.map((k) => (k.evidenceId ?? "").replace(/^[tw]:/, ""))].filter((id) => /^\d+$/.test(id));
}

/** One creator result with every evidence row its claims rest on, as the judge reads it. */
export function creatorForJudge(c: AnswerCreator, evidence: EvidenceSnapshot): Record<string, unknown> {
  const ids = new Set(citedIds(c));
  const profile = evidence.creators.find((p) => p.handle === c.handle);
  return {
    handle: `@${c.handle}`,
    computed_by_code: {
      followers: c.followers,
      usual_views: c.usualViews,
      proof_video_views: c.proofVideo.views,
      proof_video_days_ago: c.proofVideo.daysAgo,
      proof_video_region: c.proofVideo.videoRegion,
      proof_video_paid_label: c.proofVideo.paidLabel,
      proof_vs_usual: c.proofVsUsualRatio,
      posts_per_week: c.postsPerWeek,
      share_of_posts_with_paid_label: c.paidLabelShare,
      has_public_email: c.hasPublicEmail,
    },
    profile: profile ? { bio: text(profile.bio), inspected: true } : { inspected: false },
    proof_video_id: c.proofVideo.id,
    criteria: c.criteria.map((k) => ({ criterion: k.criterion, state: k.state, evidence_id: k.evidenceId })),
    videos: evidence.videos
      .filter((v) => ids.has(v.id))
      .map((v) => ({ id: v.id, caption: text(v.caption), hashtags: v.hashtags, views: v.views, region: v.region, paid_label: v.paidLabel })),
    transcripts: evidence.transcripts.filter((t) => ids.has(t.videoId)).map((t) => ({ video: t.videoId, text: text(t.text) || "no captions" })),
    watched: evidence.watches
      .filter((w) => ids.has(w.videoId))
      .map((w) => ({ video: w.videoId, observations: w.observations, on_screen_text: w.onScreenText })),
  };
}

/** The answer as a whole: what it says, what it returns, and the patterns with the text of their videos. */
export function answerForJudge(a: Answer, evidence: EvidenceSnapshot, wanted: number | null): Record<string, unknown> {
  const videoText = (id: string): Record<string, unknown> => {
    const v = evidence.videos.find((x) => x.id === id);
    const t = evidence.transcripts.find((x) => x.videoId === id);
    const w = evidence.watches.find((x) => x.videoId === id);
    return { id, caption: text(v?.caption), said: text(t?.text), seen: w?.observations ?? [], on_screen_text: w?.onScreenText ?? [] };
  };
  return {
    direct_answer: a.directAnswer,
    criteria_line_written_by_code: a.criteriaLine,
    creators_returned: a.creators.map((c) => `@${c.handle}`),
    sections_in_reading_order: (a.sections ?? []).map((s) => ({ kind: s.kind, heading: s.heading, reason: s.reason, creators: s.handles.map((h) => `@${h}`), videos: s.videoIds.map(videoText) })),
    number_asked_for: wanted,
    videos: a.videos.map((v) => ({ ...videoText(v.id), note: v.note })),
    patterns: a.patterns.map((p) => ({ pattern: p.pattern, videos: p.videoIds.map(videoText) })),
    assumptions: a.assumptions,
    limits_note: a.limitsNote,
    budget_note: a.budgetNote,
    not_found: a.notFound ?? [],
  };
}
