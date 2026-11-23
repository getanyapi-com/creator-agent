import type { EvidenceSnapshot, VideoRow, WatchRow } from "../evidence.ts";

export function captionText(v: VideoRow): string {
  return [v.caption, ...v.hashtags.map((t) => `#${t}`)].filter(Boolean).join(" ").trim();
}

export function watchText(w: WatchRow): string {
  const line = (o: { at: string; what: string }): string => `${o.at} ${o.what}`.trim();
  return [...w.observations.map(line), ...w.onScreenText.map((o) => `on screen ${line(o)}`)].join("\n").trim();
}

/** Every text in the evidence, lowercased, so a product name in free text can be found in it. */
export function evidenceText(s: EvidenceSnapshot): string {
  return [
    ...s.videos.map(captionText),
    ...s.creators.map((c) => c.bio),
    ...s.transcripts.map((t) => t.text ?? ""),
    ...s.watches.map(watchText),
  ]
    .join("\n")
    .toLowerCase();
}
