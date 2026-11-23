import { normalizeHandle, type EvidenceStore } from "../evidence.ts";
import { captionText, watchText } from "./evidenceText.ts";

export type EvidenceKind = "video" | "creator" | "transcript" | "watch";

export interface EvidenceRef {
  kind: EvidenceKind;
  id: string;
  author: string;
  /** The text this evidence holds (a caption, bio, transcript or observations); empty when it holds none. */
  text: string;
}

/**
 * Resolves an evidence id as the tools show them: a video id, `@handle` for a profile,
 * `t:<video id>` for a transcript, `w:<video id>` for a watched video. Null when nothing was stored.
 */
export function resolveEvidence(store: EvidenceStore, evidenceId: string): EvidenceRef | null {
  const id = evidenceId.trim();
  if (id.startsWith("@")) {
    const creator = store.getCreator(id);
    return creator ? { kind: "creator", id: `@${creator.handle}`, author: creator.handle, text: creator.bio } : null;
  }
  const prefixed = /^([tw]):(\d+)$/.exec(id);
  if (prefixed?.[1] && prefixed[2]) {
    const video = store.getVideo(prefixed[2]);
    if (!video) return null;
    if (prefixed[1] === "t") {
      const t = store.getTranscript(video.id);
      return t ? { kind: "transcript", id, author: video.author, text: t.text ?? "" } : null;
    }
    const w = store.getWatch(video.id);
    return w ? { kind: "watch", id, author: video.author, text: watchText(w) } : null;
  }
  const video = /^\d+$/.test(id) ? store.getVideo(id) : undefined;
  return video ? { kind: "video", id, author: normalizeHandle(video.author), text: captionText(video) } : null;
}
