import { eq, sql } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { db } from "@/db";
import { runMedia } from "@/db/schema";
import type { DisplayRun } from "@/server/live/displayTypes";
import { saveMedia } from "@/server/live/media";
import { readStoredRun } from "@/server/live/store";
import { readRun } from "@/server/liveRun";
import { CALL_TIMEOUT_MS } from "../../src/anyapi.ts";
import { DEAD_OWNER, seedRun } from "./seed";

const host = "https://p16-sign.tiktokcdn-us.com";
const display = { question: "Find creators", sections: [], creators: [], videos: [{ id: "111", imageUrl: `${host}/111.jpeg` }, { id: "222", imageUrl: `${host}/222.jpeg` }] };
const jpeg = () => new Response("jpeg", { headers: { "content-type": "image/jpeg" } });
const files = async (id: string) => (await db().select({ file: runMedia.file }).from(runMedia).where(eq(runMedia.runId, id))).map((row) => row.file).sort();

afterEach(() => vi.restoreAllMocks());

// The reviewer's HUNG_MEDIA probe: a resumed save whose first image body never finishes.
test("an image whose body never finishes ends at the data call's deadline, falls back, and the save goes on to the rest and finishes", async () => {
  const id = "aabbccddee01";
  await seedRun({ id, status: "done", owner: DEAD_OWNER, display });
  const deadlines: AbortController[] = [];
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
    deadlines.push(new AbortController());
    return deadlines.at(-1)!.signal;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => (entered = resolve));
  const urls: string[] = [];
  // The stalled body ignores the request's signal, so only the save's own deadline can end it.
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    if (urls.length > 1) return jpeg();
    entered();
    return new Response(new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(new TextEncoder().encode("partial image")) }), { headers: { "content-type": "image/jpeg" } });
  };

  await readRun(id, null);
  await started;
  expect(timeout).toHaveBeenCalledWith(CALL_TIMEOUT_MS);
  expect((await readRun(id, null))?.imagesPending).toBe(true);
  deadlines[0]!.abort();
  while (!(await readStoredRun(id))?.mediaSaved) await new Promise<void>((resolve) => setImmediate(resolve));

  expect(urls).toEqual([`${host}/111.jpeg`, `${host}/222.jpeg`]);
  expect(await files(id)).toEqual(["video-222.jpg"]);
  expect((await readRun(id, null))?.imagesPending).toBe(false);
});

test("when the write that marks the image save finished fails, the next read marks it, so the page stops asking", async () => {
  const id = "aabbccddee02";
  await seedRun({ id, status: "done", display });
  globalThis.fetch = async () => jpeg();
  await db().execute(sql`create function check_mark_fault() returns trigger language plpgsql as $$ begin if NEW.media_saved_at is not null then raise exception 'injected mark fault'; end if; return NEW; end $$`);
  await db().execute(sql`create trigger check_mark_fault before update on runs for each row execute function check_mark_fault()`);
  try {
    await expect(saveMedia(id, display as unknown as DisplayRun)).rejects.toThrow();
    expect((await readRun(id, null))?.imagesPending).toBe(true);
  } finally {
    await db().execute(sql`drop trigger check_mark_fault on runs`);
    await db().execute(sql`drop function check_mark_fault()`);
  }

  expect((await readRun(id, null))?.imagesPending).toBe(false);
  expect(await files(id)).toEqual(["video-111.jpg", "video-222.jpg"]);
});
