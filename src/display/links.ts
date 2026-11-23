import { isMediaUrl } from "../mediaUrl.ts";

/**
 * Links in the display object (round 4, F2). A link that itself carries a contact detail is dropped,
 * never cleaned. Page links (a profile, a video, the evidence a criterion cites) are built by the code
 * from a checked handle and id, so one of any other shape is dropped. Media links (profile picture,
 * cover) come from TikTok's responses; one is dropped when, read with its percent-encoding undone, it
 * holds an "@", a mail, phone or message scheme, a fragment, or a query field TikTok's image hosts
 * were not seen to use.
 */

const PAGE = /^https:\/\/www\.tiktok\.com\/@[a-z0-9._]{2,24}(?:\/video\/\d{1,30})?$/;

/**
 * Every query field on the 50,616 cover and profile picture links in all saved runs in bench/out on
 * 2026-11-21 (none had a fragment or an "@").
 */
const MEDIA_FIELDS = new Set(["dr", "refresh_token", "x-expires", "x-signature", "t", "ps", "shp", "shcp", "idc", "biz_tag", "s", "sc", "item", "from", "ftpl", "bas", "tip"]);

const SCHEME = /\b(?:mailto|tel|sms|whatsapp|viber|skype):/i;

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** A page link as the display object may show it, or null to leave it out. */
export function pageLink(url: string): string | null {
  return PAGE.test(url) ? url : null;
}

/** A media link as the display object may show it, or null to leave it out. */
export function mediaLink(url: string | null | undefined): string | null {
  if (!url || !isMediaUrl(url)) return null;
  const parsed = new URL(url);
  const plain = decoded(url);
  if (parsed.hash || plain.includes("@") || SCHEME.test(plain)) return null;
  return [...parsed.searchParams.keys()].every((k) => MEDIA_FIELDS.has(k)) ? url : null;
}
