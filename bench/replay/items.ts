import type { FinishArgs } from "../../src/finish/parse.ts";
import { splitSentences } from "../../src/finish/textClaims.ts";

/**
 * One thing the closing check rules on, named so a hand label still finds it after the check's code
 * changes: a content criterion by creator and text, a sentence by where it stands and its text, a
 * pattern's video by pattern and video id.
 */
export interface ClosingItem {
  kind: "criterion" | "sentence" | "pattern";
  /** criterion: `@handle`; sentence: answer, note, assumption, limits or reason; pattern: the video id. */
  subject: string;
  text: string;
}

export const itemKey = (run: string, i: ClosingItem): string => `${run}|${i.kind}|${i.subject}|${i.text}`;

/** Where a sentence stands, as the narrative check splits the finish. */
function sentences(args: FinishArgs): ClosingItem[] {
  const out: ClosingItem[] = [];
  const add = (subject: string, text: string): void => splitSentences(text).forEach((t) => out.push({ kind: "sentence", subject, text: t }));
  add("answer", args.answer);
  args.videos.forEach((v) => add(`note ${v.video_id}`, v.note));
  args.assumptions.forEach((a) => add("assumption", a));
  add("limits", args.limits_note);
  args.sections.forEach((s) => add(`reason ${s.kind} ${s.members.join(" ")}`, s.reason));
  return out;
}

/** Every item the closing check reads in a finish: content criteria it is asked about, sentences, and each video of each pattern. */
export function closingItems(args: FinishArgs): ClosingItem[] {
  const criteria = args.creators.flatMap((c) =>
    c.criteria.filter((k) => !k.check && k.state !== "unknown" && k.evidence_id).map((k): ClosingItem => ({ kind: "criterion", subject: `@${c.handle}`, text: k.criterion })),
  );
  const patterns = args.patterns.flatMap((p) => [...new Set(p.video_ids)].map((id): ClosingItem => ({ kind: "pattern", subject: id, text: p.pattern })));
  return [...criteria, ...sentences(args), ...patterns];
}

/**
 * Whether the check kept an item, read from what it returned: a criterion keeps the state it was
 * claimed with, a sentence keeps a label, a pattern keeps that video.
 */
export function wasKept(item: ClosingItem, before: FinishArgs, after: FinishArgs): boolean {
  if (item.kind === "criterion") {
    const handle = item.subject.slice(1);
    const claimed = before.creators.find((c) => c.handle === handle)?.criteria.find((k) => k.criterion === item.text)?.state;
    const now = after.creators.find((c) => c.handle === handle)?.criteria.find((k) => k.criterion === item.text)?.state;
    return claimed !== undefined && now === claimed;
  }
  if (item.kind === "sentence") return after.labels[item.text] !== undefined;
  return after.patterns.some((p) => p.pattern === item.text && p.video_ids.includes(item.subject));
}
