/**
 * Hosts TikTok media may come from. Measured on 2026-11-20 from seven `tiktok.video_download`
 * responses on the pinned source: `sdVideoUrl` on v16m.tiktokcdn-us.com, `videoUrl` on v16.tokcdn.com,
 * `watermarkedUrl` on tiktokv.us; the round 2 contract adds tiktokcdn.com and tiktokv.com. Cover and
 * profile images: p16-common-sign.tiktokcdn.com, tiktokcdn-us.com and tiktokcdn-eu.com in the AnyAPI
 * catalog's recorded `tiktok.profile`, `tiktok.search_keyword` and `tiktok.profile_videos` responses.
 */
const MEDIA_DOMAINS = ["tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "tiktokv.com", "tiktokv.us", "tokcdn.com"];

/** True for an https link on a TikTok media host, with no credentials or port. */
export function isMediaUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return MEDIA_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}
