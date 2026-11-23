import type { ContactStore } from "./contactStore.ts";
import type { Contact } from "./contacts.ts";
import { normalizeHandle, type CreatorRow, type VideoRow } from "./evidence.ts";
import { isMediaUrl } from "./mediaUrl.ts";
import { cleanText } from "./untrusted.ts";

type Raw = Record<string, unknown>;

/** TikTok usernames: 2 to 24 letters, digits, underscores and periods (TikTok's username rules). */
const HANDLE = /^[a-z0-9._]{2,24}$/;
const REGION = /^[A-Z]{2}$/;

/** A handle from a response, lowercased, or null when it breaks TikTok's handle rules (round 4, A3). */
export function validHandle(value: string): string | null {
  const h = normalizeHandle(value);
  return HANDLE.test(h) ? h : null;
}

/** A region is a two-letter country code or unknown (round 4, A3). */
function region(value: unknown): string | null {
  const r = typeof value === "string" ? value.trim().toUpperCase() : "";
  return REGION.test(r) ? r : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Hashtags are TikTok text too: one that held a contact detail is dropped and the detail kept apart. */
function hashtags(value: unknown, sink: (found: Contact[]) => void): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((t): t is string => typeof t === "string").filter((t) => cleanText(t, Infinity, sink) === t.trim());
}

/**
 * A follower count of 0 is read as unknown: a failed profile read returned `followers: 0` for a
 * creator who has 435 (round 2 review, 2026-11-20).
 */
function followers(value: unknown): number | null {
  const n = num(value);
  return n === 0 ? null : n;
}

/** A media link kept for the web app only when it is on a TikTok media host. */
function mediaLink(value: unknown): string | null {
  return typeof value === "string" && isMediaUrl(value) ? value : null;
}

/** The list of rows in an AnyAPI listing response (`data.videos`). */
export function listRows(data: Raw | null): Raw[] {
  const rows = data?.videos;
  return Array.isArray(rows) ? rows.filter((r): r is Raw => typeof r === "object" && r !== null) : [];
}

export function videoUrl(author: string, id: string): string {
  return `https://www.tiktok.com/@${author}/video/${id}`;
}

/**
 * Turns a raw TikTok video row into evidence, routing any contact detail to the contact store. The
 * video link is always built by the code, so no link from the response reaches the answer.
 */
export function toVideoRow(raw: Raw, foundBy: string | null, contacts: ContactStore): VideoRow | null {
  const id = str(raw.id);
  const author = validHandle(str(raw.author) || str(raw.authorHandle));
  if (!/^\d+$/.test(id) || author === null) return null;
  const sink = (found: Contact[]): void => contacts.add(author, found, "caption");
  return {
    id,
    author,
    url: videoUrl(author, id),
    views: num(raw.views),
    likes: num(raw.likes),
    comments: num(raw.comments),
    shares: num(raw.shares),
    saves: num(raw.saves),
    createdUtc: num(raw.createdUtc),
    region: region(raw.region),
    paidLabel: bool(raw.paidPartnership),
    isPinned: bool(raw.isPinned),
    durationSeconds: num(raw.durationSeconds),
    caption: cleanText(str(raw.caption), Infinity, sink),
    hashtags: hashtags(raw.hashtags, sink),
    foundBy: foundBy ? [foundBy] : [],
    image: mediaLink(raw.image),
  };
}

/**
 * Turns a raw TikTok profile into evidence; the bio is cleaned and its contacts kept apart. Null when
 * the handle breaks TikTok's handle rules: the row is dropped at ingest.
 */
export function toCreatorRow(raw: Raw, handle: string, contacts: ContactStore, sampled: string[]): CreatorRow | null {
  const h = validHandle(str(raw.handle) || handle);
  if (h === null) return null;
  const sink = (found: Contact[]): void => contacts.add(h, found, "bio");
  const bio = cleanText(str(raw.bio), Infinity, sink);
  // The profile link (`tiktok.profile`) is a contact, never evidence.
  cleanText(str(raw.externalUrl), Infinity, sink);
  return {
    handle: h,
    followers: followers(raw.followers),
    likes: num(raw.likes),
    videoCount: num(raw.videos),
    verified: bool(raw.verified),
    bio,
    avatarUrl: mediaLink(raw.avatarUrl),
    hasPublicEmail: contacts.hasEmail(h),
    sampledVideoIds: sampled,
  };
}
