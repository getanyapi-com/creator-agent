import type { Answer, AnswerClose, AnswerCreator, AnswerVideo, DroppedClaim, Tier } from "../answer.ts";
import type { ContactStore } from "../contactStore.ts";
import type { EvidenceStore, VideoRow } from "../evidence.ts";
import { breakoutRatio, creatorFigures, daysAgo } from "../metrics.ts";
import { criteriaLine } from "./criteriaLine.ts";
import type { FinishArgs, FinishCreator } from "./parse.ts";
import { settleSections } from "./sections.ts";

export interface RenderInput {
  question: string;
  tier: Tier;
  args: FinishArgs;
  store: EvidenceStore;
  contacts: ContactStore;
  nowSec: number;
  budgetNote: string | null;
  notFound: string[];
  finishedBy: Answer["finishedBy"];
  dropped: DroppedClaim[];
}

export function answerVideo(v: VideoRow, nowSec: number, note: string | null): AnswerVideo {
  return {
    id: v.id,
    url: v.url,
    creator: v.author,
    views: v.views,
    likes: v.likes,
    postedUtc: v.createdUtc,
    daysAgo: daysAgo(v.createdUtc, nowSec),
    videoRegion: v.region,
    paidLabel: v.paidLabel,
    note,
    ...(v.image ? { image: v.image } : {}),
  };
}

function answerCreator(input: RenderInput, c: FinishCreator, proof: VideoRow): AnswerCreator {
  const creator = input.store.getCreator(c.handle);
  const f = creator ? creatorFigures(input.store, creator) : null;
  return {
    handle: c.handle,
    profileUrl: `https://www.tiktok.com/@${c.handle}`,
    ...(creator?.avatarUrl ? { avatarUrl: creator.avatarUrl } : {}),
    followers: f?.followers ?? null,
    usualViews: f?.usualViews ?? null,
    postsSampled: f?.postsSampled ?? 0,
    bestRecentVideoId: f?.best?.id ?? null,
    bestRecentViews: f?.best?.views ?? null,
    proofVsUsualRatio: breakoutRatio(proof.views, f?.usualViews ?? null),
    postsPerWeek: f?.postsPerWeek ?? null,
    paidLabelShare: f?.paidShare ?? null,
    hasPublicEmail: input.contacts.hasEmail(c.handle),
    proofVideo: answerVideo(proof, input.nowSec, null),
    criteria: c.criteria.map((k) => ({ criterion: k.criterion, state: k.state, evidenceId: k.evidence_id, check: k.check })),
  };
}

/** Builds the answer from validated claims; the figures come from evidence, never from the model. */
export function renderAnswer(input: RenderInput): Answer {
  const { args, store, nowSec } = input;
  const creators: AnswerCreator[] = [];
  for (const c of args.creators) {
    const proof = store.getVideo(c.proof_video_id);
    if (proof) creators.push(answerCreator(input, c, proof));
  }
  const close: AnswerClose[] = args.close.flatMap((c) => {
    const proof = store.getVideo(c.proof_video_id);
    return proof ? [{ ...answerCreator(input, c, proof), missed: c.missed }] : [];
  });
  const videos: AnswerVideo[] = [];
  for (const v of args.videos) {
    const row = store.getVideo(v.video_id);
    if (row) videos.push(answerVideo(row, nowSec, v.note || null));
  }
  const patterns = args.patterns.map((p) => ({ pattern: p.pattern, videoIds: p.video_ids.filter((id) => store.getVideo(id)) }));
  const shownVideoIds = new Set([...patterns.flatMap((p) => p.videoIds), ...videos.map((v) => v.id), ...creators.map((c) => c.proofVideo.id)]);
  return {
    question: input.question,
    tier: input.tier.kind,
    directAnswer: args.answer,
    checks: args.checks,
    criteriaLine: criteriaLine(args.checks, args.excluded, args.checksReadBy),
    excluded: args.excluded,
    creators,
    close,
    videos,
    patterns,
    sections: settleSections(args.sections, { handles: creators.map((c) => c.handle), videoIds: shownVideoIds }),
    assumptions: args.assumptions,
    limitsNote: args.limits_note,
    notFound: input.notFound,
    budgetNote: input.budgetNote,
    finishedBy: input.finishedBy,
    droppedClaims: input.dropped,
    sentenceLabels: args.labels,
    codeSentences: args.codeSentences,
  };
}
