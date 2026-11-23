import manifest from "./fixtureMedia.json";

/** Local copies of the recorded answers' avatars and covers in public/fixture-media/, listed by scripts/fetch-fixture-media.mjs. */
const avatars = new Set(manifest.avatars);
const videos = new Set(manifest.videos);

/** The URL of a recorded answer's saved image by name (avatar-<handle> or video-<id>), when one was saved. */
export function fixtureMedia(name: string): string | undefined {
  const saved = name.startsWith("avatar-") ? avatars.has(name.slice("avatar-".length)) : name.startsWith("video-") && videos.has(name.slice("video-".length));
  return saved ? `/fixture-media/${name}.jpg` : undefined;
}
