import type { VideoView } from "@/data/types";

/** A video's caption as a tile or panel shows it; when the contact check left it out, it says the post on TikTok has it. */
export function captionText(video: VideoView): string {
  return video.caption ?? (video.captionOnTikTok ? "Caption on TikTok" : "No caption");
}
