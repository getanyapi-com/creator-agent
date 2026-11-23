/** Validation of the arguments a model passes to a tool: a handle, a query, an id, nothing else. */
export class ArgError extends Error {}

export type Args = Record<string, unknown>;

/** TikTok usernames are 2 to 24 letters, digits, underscores and periods (TikTok's username rules). */
const HANDLE = /^[A-Za-z0-9._]{2,24}$/;
const VIDEO_ID = /^\d+$/;
const VIDEO_URL = /^https:\/\/(?:www\.|m\.)?tiktok\.com\/@([A-Za-z0-9._]{2,24})\/video\/(\d+)(?:[/?#].*)?$/;
/** One line of plain words: no markup and no line breaks. */
const QUERY = /^[^\n\r<>{}]+$/;
export const SORTS = ["relevance", "most-liked", "date-posted"] as const;
/** The `datePosted` values `tiktok.search_keyword` documents as filtering. */
export const DAYS = [0, 1, 7, 30, 90, 180] as const;

export function handleArg(args: Args, key = "handle"): string {
  const raw = typeof args[key] === "string" ? (args[key] as string).trim().replace(/^@/, "") : "";
  if (!HANDLE.test(raw)) throw new ArgError(`${key} must be a TikTok handle`);
  return raw.toLowerCase();
}

export function queryArg(args: Args): string {
  const raw = typeof args.query === "string" ? args.query.trim() : "";
  if (!QUERY.test(raw)) throw new ArgError("query must be a short search phrase");
  return raw;
}

export function sortArg(args: Args): (typeof SORTS)[number] {
  const raw = args.sort ?? "relevance";
  if (!SORTS.includes(raw as (typeof SORTS)[number])) throw new ArgError(`sort must be one of ${SORTS.join(", ")}`);
  return raw as (typeof SORTS)[number];
}

export function daysArg(args: Args): (typeof DAYS)[number] {
  const raw = args.days ?? 30;
  const value = typeof raw === "string" ? Number(raw) : raw;
  if (!DAYS.includes(value as (typeof DAYS)[number])) throw new ArgError(`days must be one of ${DAYS.join(", ")}`);
  return value as (typeof DAYS)[number];
}

export interface VideoRef {
  id: string;
  author: string | null;
}

/** A video id, or a TikTok video URL from which the id and author are read. */
export function videoArg(args: Args): VideoRef {
  const raw = typeof args.video === "string" ? args.video.trim() : "";
  if (VIDEO_ID.test(raw)) return { id: raw, author: null };
  const match = VIDEO_URL.exec(raw);
  if (match?.[1] && match[2]) return { id: match[2], author: match[1].toLowerCase() };
  throw new ArgError("video must be a video id or a https://www.tiktok.com/@handle/video/<id> URL");
}
