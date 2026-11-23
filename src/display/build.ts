import type { AnswerCreator, AnswerVideo, Criterion } from "../answer.ts";
import { MemoryEvidenceStore, type EvidenceStore } from "../evidence.ts";
import { resolveEvidence } from "../finish/evidenceRef.ts";
import { answerVideo } from "../finish/render.ts";
import { CODE_HEADINGS, type AnswerSection } from "../finish/sections.ts";
import { splitSentences } from "../finish/textClaims.ts";
import { CAPTION_CHARS } from "../tools/searchVideos.ts";
import type { RunOutput } from "../trace.ts";
import { CONTACT_PLACEHOLDER } from "../contacts.ts";
import { clip } from "../untrusted.ts";
import { gateCleaner, runHandles, type Cleaner } from "./clean.ts";
import { mediaLink, pageLink } from "./links.ts";
import { revealContact } from "./reveal.ts";
import { closingSteps, openingSteps, traceSteps } from "./steps.ts";
import type { DisplayCreator, DisplayCriterion, DisplayEvidence, DisplayRun, DisplaySection, DisplaySentence, DisplayVideo } from "./types.ts";

/** An evidence excerpt is as long as the caption the spec shows the model in a search row. */
const EXCERPT_CHARS = CAPTION_CHARS;
const HANDLE = /^[a-z0-9._]{2,24}$/;

/** Transcript text without its WEBVTT header and cue timings. */
function spoken(text: string): string {
  return text
    .replace(/^\s*WEBVTT\b/, "")
    .replace(/\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A clipped excerpt never ends inside "[removed]": a cut placeholder ("[remo...") reads as text of its own. */
function wholePlaceholders(clipped: string): string {
  const open = clipped.lastIndexOf("[");
  const tail = clipped.slice(open);
  return open >= 0 && !tail.includes("]") && CONTACT_PLACEHOLDER.startsWith(tail.replace(/\.\.\.$/, "")) ? `${clipped.slice(0, open).trimEnd()}...` : clipped;
}

interface Builder {
  run: RunOutput;
  store: EvidenceStore;
  clean: Cleaner;
}

function sentences(b: Builder, text: string): DisplaySentence[] {
  const labels = b.run.answer.sentenceLabels;
  return splitSentences(text).flatMap((s) => {
    const shown = b.clean("model", s);
    return shown?.trim() ? [{ text: shown, label: labels[s] ?? "other" }] : [];
  });
}

function evidence(b: Builder, evidenceId: string | null, fromCheck: boolean): DisplayEvidence | null {
  const ref = evidenceId ? resolveEvidence(b.store, evidenceId) : null;
  if (!ref) return null;
  if (ref.kind === "creator") {
    const profile = pageLink(`https://www.tiktok.com/@${ref.author}`);
    return profile ? { kind: "creator", url: profile, excerpt: null } : null;
  }
  const videoId = ref.id.replace(/^[tw]:/, "");
  const url = pageLink(b.store.getVideo(videoId)?.url ?? `https://www.tiktok.com/@${ref.author}/video/${videoId}`);
  if (!url) return null;
  const text = ref.kind === "transcript" ? spoken(ref.text) : ref.text;
  const excerpt = fromCheck || !text ? null : b.clean("excerpt", wholePlaceholders(clip(text, EXCERPT_CHARS)));
  return { kind: ref.kind, url, excerpt: excerpt?.trim() ? excerpt : null };
}

function criterion(b: Builder, k: Criterion): DisplayCriterion | null {
  const text = k.check ? k.criterion : b.clean("model", k.criterion);
  if (!text?.trim()) return null;
  return { text, state: k.state, source: k.check ? "check" : "claim", evidence: evidence(b, k.evidenceId, k.check !== null) };
}

function video(b: Builder, v: AnswerVideo): DisplayVideo {
  const caption = b.store.getVideo(v.id)?.caption ?? "";
  const shown = caption ? b.clean("caption", caption) : null;
  return {
    id: v.id,
    url: v.url,
    creator: v.creator,
    views: v.views,
    likes: v.likes,
    postedUtc: v.postedUtc,
    daysAgo: v.daysAgo,
    region: v.videoRegion,
    paidLabel: v.paidLabel,
    caption: shown?.trim() ? shown : null,
    note: v.note ? sentences(b, v.note) : [],
    imageUrl: mediaLink(v.image),
  };
}

function creator(b: Builder, c: AnswerCreator): DisplayCreator {
  return {
    handle: c.handle,
    profileUrl: c.profileUrl,
    avatarUrl: mediaLink(c.avatarUrl),
    followers: c.followers,
    usualViews: c.usualViews,
    postsSampled: c.postsSampled,
    bestRecentViews: c.bestRecentViews,
    proofVsUsualRatio: c.proofVsUsualRatio,
    postsPerWeek: c.postsPerWeek,
    paidLabelShare: c.paidLabelShare,
    hasPublicEmail: revealContact(b.run, c.handle).email !== null,
    proofVideo: video(b, c.proofVideo),
    criteria: c.criteria.map((k) => criterion(b, k)).filter((k): k is DisplayCriterion => k !== null),
  };
}

/** One section with its members' code-computed fields; heading and reason pass the gate like other model text. */
function section(b: Builder, s: AnswerSection, creators: Map<string, DisplayCreator>): DisplaySection {
  const heading = b.clean("model", s.heading)?.trim() || CODE_HEADINGS[s.kind];
  const reason = s.reason ? b.clean("model", s.reason)?.trim() || null : null;
  const videos = s.videoIds.flatMap((id) => {
    const row = b.store.getVideo(id);
    return row ? [video(b, answerVideo(row, b.run.nowSec, null))] : [];
  });
  return { kind: s.kind, heading, reason, creators: s.handles.flatMap((h) => creators.get(h) ?? []), videos, videoIds: videos.map((v) => v.id) };
}

/**
 * Builds the display object from a finished run's private record, passing every free-text string
 * through `clean`. Everything else is a code-computed fact or a link the code builds; no bio text,
 * no raw tool output, no service error text and no contact detail is copied in.
 */
export function buildDisplay(run: RunOutput, clean: Cleaner): DisplayRun {
  const a = run.answer;
  const store = MemoryEvidenceStore.fromSnapshot(run.evidence);
  const b: Builder = { run, store, clean };
  const authorOf = (id: string): string | null => store.getVideo(id)?.author ?? null;
  const limits = clean("model", a.limitsNote);
  const creators = a.creators.map((c) => creator(b, c));
  const byHandle = new Map(creators.map((c) => [c.handle, c]));
  return {
    question: clean("question", a.question) ?? "",
    answer: sentences(b, a.directAnswer),
    criteriaLine: a.criteriaLine,
    excluded: a.excluded,
    creators,
    videos: a.videos.map((v) => video(b, v)),
    patterns: a.patterns.flatMap((p) => {
      const text = clean("model", p.pattern);
      return text?.trim() ? [{ text, videoIds: p.videoIds }] : [];
    }),
    sections: (a.sections ?? []).map((s) => section(b, s, byHandle)),
    assumptions: a.assumptions.map((s) => clean("model", s) ?? "").filter((s) => s.trim()),
    limits: limits?.trim() ? limits : null,
    limitsSentences: sentences(b, a.limitsNote),
    notFound: a.notFound.filter((h) => HANDLE.test(h)),
    budgetNote: a.budgetNote,
    finishedBy: a.finishedBy,
    steps: [...openingSteps(run), ...traceSteps(run.trace, (q) => clean("query", q), authorOf), ...closingSteps(run)],
    cost: {
      limitUsd: run.costs.limitUsd,
      dataUsd: run.costs.dataUsd,
      modelUsd: run.costs.modelUsd,
      totalUsd: run.costs.totalUsd,
      dataCalls: run.costs.dataCalls,
      modelTurns: run.modelTurns,
      wallMs: run.wallMs,
    },
    gate: run.gate.path,
  };
}

/** The display object for a finished run: the only thing a browser may receive (round 4, A1). */
export function toDisplay(run: RunOutput): DisplayRun {
  return buildDisplay(run, gateCleaner(run.gate, runHandles(run)));
}
