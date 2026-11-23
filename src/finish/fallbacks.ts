import type { EvidenceStore } from "../evidence.ts";
import type { FinishArgs } from "./parse.ts";
import { videoIdsIn } from "./subjects.ts";
import { splitSentences } from "./textClaims.ts";

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const names = (text: string, handle: string): boolean => new RegExp(`@${handle.replace(/\./g, "\\.")}(?![\\w]|\\.\\w)`, "i").test(text);

/** The video the question links, when it is in the evidence: what a "why did this video work" answer is about. */
function askedVideo(store: EvidenceStore, question: string): { id: string; author: string } | null {
  for (const id of videoIdsIn(question)) {
    const v = store.getVideo(id);
    if (v) return { id, author: v.author };
  }
  return null;
}

/** The answer's best fit: the creator its best section names first, or else its first creator. */
function bestFit(args: FinishArgs): string | null {
  const best = args.sections.find((s) => s.kind === "best")?.members.map((m) => m.replace(/^@/, "").toLowerCase()).find((h) => args.creators.some((c) => c.handle === h));
  return best ?? args.creators[0]?.handle ?? null;
}

/**
 * The code's own sentences for an answer the closing check cut (round 5), from facts the code holds:
 * - when the question links a video and a sentence of the answer was cut, and what is left names
 *   neither that video nor its creator: which video the answer is about;
 * - when the question compares creators by @handle and a sentence was cut, and what is left does not
 *   name the answer's best fit: which creator that is;
 * - when no sentence is left while creators or patterns remain: how many creators met the checks the
 *   question set (or how many the answer lists), and that the reasons are in the sections below.
 * They lead the answer, are labelled facts, and are listed in `codeSentences` so nothing reads them as
 * model text.
 */
export function withCodeSentences(before: FinishArgs, after: FinishArgs, store: EvidenceStore, question: string): FinishArgs {
  const cut = splitSentences(after.answer).length < splitSentences(before.answer).length;
  const written: string[] = [];
  const video = askedVideo(store, question);
  if (cut && video && !after.answer.includes(video.id) && !names(after.answer, video.author)) written.push(`This answer is about the video ${video.id} by @${video.author}.`);
  const compared = new Set([...question.matchAll(/@([A-Za-z0-9._]{2,24})/g)].map((m) => (m[1] ?? "").toLowerCase().replace(/\.+$/, "")));
  const best = bestFit(after);
  if (cut && compared.size >= 2 && best && !names(after.answer, best)) written.push(`Of the creators compared, the answer's best fit is @${best}.`);
  if (!after.answer.trim()) {
    const n = after.creators.length;
    const asked = after.checks.some((c) => c.from === "question");
    if (n > 0) written.push(asked ? `${plural(n, "creator meets", "creators meet")} every check the question set; the reasons are in the sections below.` : `The answer lists ${plural(n, "creator", "creators")}; the reasons are in the sections below.`);
    else if (after.patterns.length > 0) written.push(`The answer found ${plural(after.patterns.length, "pattern", "patterns")}; the videos that show ${after.patterns.length === 1 ? "it" : "each"} are below.`);
  }
  if (written.length === 0) return after;
  return {
    ...after,
    answer: [...written, after.answer].filter((t) => t.trim()).join(" "),
    labels: { ...after.labels, ...Object.fromEntries(written.map((t) => [t, "fact" as const])) },
    codeSentences: [...after.codeSentences, ...written],
  };
}
