import type { FetchFn } from "../anyapi.ts";
import { isMediaUrl } from "../mediaUrl.ts";
import { MAX_ORIGINAL_BYTES } from "./limits.ts";

/** Same per-call timeout as the data client: a stuck download is ended, not waited on. */
const DOWNLOAD_TIMEOUT_MS = 120_000;

/** The Fetch standard's redirect limit, kept while each hop is checked by hand. */
const MAX_REDIRECTS = 20;

export type Fetched = { ok: true; bytes: Uint8Array } | { ok: false; error: string; tooLarge?: true };

const TOO_LARGE: Fetched = { ok: false, error: "the file is larger than the video path can use", tooLarge: true };

async function readCapped(res: Response, maxBytes: number): Promise<Fetched> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return TOO_LARGE;
  const reader = res.body?.getReader();
  if (!reader) return { ok: false, error: "the file had no body" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, bytes };
}

/**
 * Fetches a video file only from a TikTok media host over https, following redirects only to such
 * hosts, up to `maxBytes`: what the downscale step needs (round 4, D4); the bench's video comparison measures larger files too.
 */
export async function fetchVideoFile(url: string, fetchFn: FetchFn = fetch, maxBytes = MAX_ORIGINAL_BYTES): Promise<Fetched> {
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  let next = url;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!isMediaUrl(next)) return { ok: false, error: "the file is not on a TikTok media host" };
      const res = await fetchFn(next, { redirect: "manual", signal });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) return { ok: false, error: "a redirect had no location" };
        next = new URL(location, next).href;
        continue;
      }
      if (!res.ok) return { ok: false, error: `the file host answered HTTP ${res.status}` };
      return await readCapped(res, maxBytes);
    }
    return { ok: false, error: "too many redirects" };
  } catch (err) {
    return { ok: false, error: `the file could not be fetched: ${err instanceof Error ? err.message : String(err)}` };
  }
}
