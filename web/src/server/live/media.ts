import { and, eq, inArray, or } from "drizzle-orm";
import { CALL_TIMEOUT_MS } from "../../../../src/anyapi.ts";
import { db } from "@/db";
import { runMedia, runs } from "@/db/schema";
import { within } from "@/server/within";
import type { DisplayRun } from "./displayTypes";
import { isRunId, markMediaSaved } from "./store";

/**
 * A run's saved avatars and covers, as bytes in `run_media`. A finished run saved 0 to 34 images in the
 * dev build (web/.data/runs, 10 runs, 2026-11-22): 7 KB to 315 KB each, median 34 KB, at most 1.3 MB a
 * run, a size Postgres keeps in a row without trouble. lurk keeps no images (its avatars are Reddit's own
 * links, `src/lib/redditAvatar.ts`); TikTok's links expire within hours, so these must be kept.
 */

/** Image types a browser shows, and the extension each is saved under. */
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const SAVED_FILE = /^(?:avatar|video)-[A-Za-z0-9._-]+\.[a-z]+$/;

interface Wanted {
  name: string;
  url: string;
}

/**
 * Every avatar and cover the display object links, close creators' included, named avatar-<handle> and video-<id>. The core has
 * already checked each link is https on a TikTok media host when it read the row (`src/ingest.ts`).
 * A pattern video the display object carries no row for has no cover to save.
 */
function wanted(display: DisplayRun): Wanted[] {
  const items: Wanted[] = [];
  const add = (name: string, url: string | null) => {
    if (url && SAFE_NAME.test(name) && !items.some((item) => item.name === name)) items.push({ name, url });
  };
  for (const creator of [...display.creators, ...(display.close ?? [])]) {
    add(`avatar-${creator.handle}`, creator.avatarUrl);
    add(`video-${creator.proofVideo.id}`, creator.proofVideo.imageUrl);
  }
  for (const video of display.videos) add(`video-${video.id}`, video.imageUrl);
  return items;
}

/** One image's type, extension and bytes, or null for an answer that is not an image a browser shows. */
async function download(url: string, signal: AbortSignal): Promise<{ type: string; ext: string; bytes: Buffer } | null> {
  const res = await fetch(url, { signal });
  const type = (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  const ext = EXTENSIONS[type];
  if (!res.ok || ext === undefined) return null;
  return { type, ext, bytes: Buffer.from(await res.arrayBuffer()) };
}

async function save(id: string, item: Wanted): Promise<void> {
  // Each image, headers and whole body, ends within the core's deadline for one AnyAPI data call (`CALL_TIMEOUT_MS`,
  // src/anyapi.ts), so one that never finishes falls back like a failed one and the save goes on to the next.
  const signal = AbortSignal.timeout(CALL_TIMEOUT_MS);
  try {
    const image = await within(signal, download(item.url, signal));
    if (image === null) return;
    await db().insert(runMedia).values({ runId: id, file: `${item.name}.${image.ext}`, type: image.type, bytes: image.bytes }).onConflictDoNothing();
  } catch {
    // A missing image falls back to an initial or a neutral tile, as for the recorded answers.
  }
}

/** Runs whose images this process saved but could not mark saved; the next read marks them (`retryMediaMark`). */
const unmarked = new Set<string>();

async function markSaved(id: string): Promise<void> {
  try {
    await markMediaSaved(id);
  } catch (err) {
    unmarked.add(id);
    throw err;
  }
  unmarked.delete(id);
}

/**
 * Saves the answer's images while their TikTok links still work (they expire within hours), skipping any
 * already saved, then marks the save finished. Runs after the answer is saved, so a slow image host never
 * holds the page; what is not saved yet, or whose link has expired, falls back.
 */
export async function saveMedia(id: string, display: DisplayRun): Promise<void> {
  const saved = new Set(Object.keys((await savedMedia([id])).get(id) ?? {}));
  for (const item of wanted(display)) if (!saved.has(item.name)) await save(id, item);
  await markSaved(id);
}

/** Marks a run's image save finished when this process saved its images but could not mark it; true when it did now. */
export async function retryMediaMark(id: string): Promise<boolean> {
  if (!unmarked.has(id)) return false;
  await markSaved(id);
  return true;
}

/** The URLs the app serves each run's saved images at, by run and by name without extension. */
export async function savedMedia(ids: string[]): Promise<Map<string, Record<string, string>>> {
  const byRun = new Map<string, Record<string, string>>(ids.map((id) => [id, {}]));
  if (ids.length === 0) return byRun;
  const rows = await db().select({ runId: runMedia.runId, file: runMedia.file }).from(runMedia).where(inArray(runMedia.runId, ids));
  for (const { runId, file } of rows) {
    const media = byRun.get(runId);
    if (media !== undefined) media[file.replace(/\.[a-z]+$/, "")] = `/api/media/${runId}/${file}`;
  }
  return byRun;
}

/**
 * A saved image's bytes and type, or null for anything that is not one of this run's saved images. A wallet
 * question's images are private like the question: only its asker gets them.
 */
export async function readMedia(id: string, file: string, viewerId: string | null): Promise<{ bytes: Buffer; type: string } | null> {
  if (!isRunId(id) || !SAVED_FILE.test(file)) return null;
  const visible = viewerId === null ? eq(runs.tier, "free") : or(eq(runs.tier, "free"), eq(runs.askerId, viewerId));
  const [row] = await db()
    .select({ bytes: runMedia.bytes, type: runMedia.type })
    .from(runMedia)
    .innerJoin(runs, eq(runs.id, runMedia.runId))
    .where(and(eq(runMedia.runId, id), eq(runMedia.file, file), visible));
  return row ?? null;
}
