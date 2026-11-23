import { mkdirSync, writeFileSync } from "node:fs";
import { captionText, watchText } from "../../src/finish/evidenceText.ts";
import { checkLabel } from "../../src/finish/checks.ts";
import { creatorFigures, daysAgo } from "../../src/metrics.ts";
import { OUT_DIR } from "../questions.ts";
import { closingItems } from "./items.ts";
import { closingInputs, MEASURED_PASSES, type ClosingInput } from "./savedRuns.ts";

/** A video as a labeller reads it: figures, caption, what is said and what was seen. */
function videoLines(input: ClosingInput, id: string): string[] {
  const v = input.store.getVideo(id);
  if (!v) return [`  video ${id}: not in the evidence`];
  const t = input.store.getTranscript(id)?.text;
  const w = input.store.getWatch(id);
  return [
    `  video ${id} by @${v.author}: ${v.views ?? "?"} views, ${daysAgo(v.createdUtc, input.nowSec) ?? "?"} days ago, region ${v.region ?? "?"}, paid ${v.paidLabel ?? "?"}`,
    `    caption: ${captionText(v)}`,
    ...(t ? [`    said: ${t}`] : []),
    ...(w ? [`    seen: ${watchText(w).replace(/\n/g, " | ")}`, `    why it worked (video model): ${w.hypothesis}`] : []),
  ];
}

function creatorLines(input: ClosingInput, handle: string): string[] {
  const c = input.store.getCreator(handle);
  const videos = input.store.videosBy(handle).map((v) => v.id);
  if (!c) return [`@${handle}: no profile read`, ...videos.flatMap((id) => videoLines(input, id))];
  const f = creatorFigures(input.store, c);
  return [
    `@${handle}: ${c.followers ?? "?"} followers, usual views ${f.usualViews ?? "?"}, best recent ${f.best?.views ?? "?"}, ${f.postsPerWeek ?? "?"} posts a week, paid share ${f.paidShare ?? "?"}`,
    `  bio: ${c.bio}`,
    ...videos.flatMap((id) => videoLines(input, id)),
  ];
}

/**
 * Writes, for each saved run the replay measures, every item the closing check reads with the
 * evidence a careful reader would use, so the items can be labelled by hand. Files go to
 * `bench/out/closing-replay/dump/` (private: they hold bios).
 */
export function closingDump(): void {
  const dir = new URL("./closing-replay/dump/", OUT_DIR);
  mkdirSync(dir, { recursive: true });
  for (const input of closingInputs(MEASURED_PASSES)) {
    const a = input.args;
    const lines = [
      `run ${input.run}`,
      `question: ${input.question}`,
      `checks: ${a.checks.map((c) => `${checkLabel(c)} (${c.from})`).join("; ") || "none"}`,
      "",
      "ITEMS",
      ...closingItems(a).map((i) => `[${i.kind}] ${i.subject} :: ${i.text}`),
      "",
      "CREATORS",
      ...a.creators.flatMap((c) => [
        `== @${c.handle} proof ${c.proof_video_id}`,
        ...c.criteria.map((k) => `  criterion (${k.state}${k.check ? ", code check" : ""}, ${k.evidence_id ?? "-"}): ${k.criterion}`),
        ...creatorLines(input, c.handle),
      ]),
      "",
      "OTHER VIDEOS NAMED",
      ...[...new Set([...a.videos.map((v) => v.video_id), ...a.patterns.flatMap((p) => p.video_ids), ...a.sections.flatMap((s) => (s.kind === "pattern" ? s.members : []))])].flatMap((id) => videoLines(input, id)),
    ];
    writeFileSync(new URL(`${input.run.replace("/", "__")}.txt`, dir), lines.join("\n"));
  }
}
