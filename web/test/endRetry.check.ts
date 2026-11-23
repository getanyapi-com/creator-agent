import { sql } from "drizzle-orm";
import { expect, test, vi } from "vitest";
import { db } from "@/db";
import type { DisplayRun } from "@/server/live/displayTypes";
import { saveMedia } from "@/server/live/media";
import { endRun, retryEnd } from "@/server/live/runEnd";
import { readStoredRun } from "@/server/live/store";
import { seedRun } from "./seed";

const id = "aabbccdd0002";
const display = { question: "Find creators", sections: [], creators: [], videos: [{ id: "111", imageUrl: "https://p16-sign.tiktokcdn-us.com/111.jpeg" }] };

// The reviewer's end-retry probe: two readers retry a run's failed final transaction at once.
test("a retried end of a run that two readers retry at once starts the image save once, from the call that ended it", async () => {
  await seedRun({ id, status: "running" });
  await db().execute(sql`create function check_end_fault() returns trigger language plpgsql as $$ begin raise exception 'injected end fault'; end $$`);
  await db().execute(sql`create trigger check_end_fault before update on runs for each row execute function check_end_fault()`);
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  let thens = 0;
  const saves: Promise<void>[] = [];
  // The finished run's completion step in liveRun.ts: start the image save.
  const then = async () => {
    thens += 1;
    saves.push(saveMedia(id, display as unknown as DisplayRun));
  };
  try {
    await endRun(id, { status: "done", error: null, display }, [], then);
  } finally {
    await db().execute(sql`drop trigger check_end_fault on runs`);
    await db().execute(sql`drop function check_end_fault()`);
    logged.mockRestore();
  }
  expect((await readStoredRun(id))?.status).toBe("running");
  expect(thens).toBe(0);

  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response("jpeg", { headers: { "content-type": "image/jpeg" } });
  };
  await Promise.all([retryEnd(id), retryEnd(id)]);
  await Promise.all(saves);

  expect((await readStoredRun(id))?.status).toBe("done");
  expect(thens).toBe(1);
  expect(requests).toBe(1);
});
