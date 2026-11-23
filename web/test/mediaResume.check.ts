import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { db } from "@/db";
import { processOwner } from "@/db/owner";
import { runMedia, runs } from "@/db/schema";
import { readRun } from "@/server/liveRun";
import { DEAD_OWNER, seedRun } from "./seed";

const id = "0123456789ab";
const host = "https://p16-sign.tiktokcdn-us.com";
const display = {
  question: "Find pottery creators",
  sections: [],
  creators: [{ handle: "potter", avatarUrl: `${host}/potter.jpeg`, proofVideo: { id: "111", imageUrl: `${host}/111.jpeg` } }],
  videos: [{ id: "222", imageUrl: `${host}/222.jpeg` }],
};

const savedAt = async () => (await db().select({ at: runs.mediaSavedAt, owner: runs.owner }).from(runs).where(eq(runs.id, id)))[0];

test("a finished run whose image save a dead process left part-way resumes it once when read, and an expired link falls back", async () => {
  // Thread 430a90d9a87b: the server restarted after 15 of 20 images were saved. Here one of three is saved, and one link has expired.
  await seedRun({ id, status: "done", owner: DEAD_OWNER, display });
  await db().insert(runMedia).values({ runId: id, file: "avatar-potter.jpg", type: "image/jpeg", bytes: Buffer.from("saved") });
  const fetched: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    fetched.push(url);
    return url.endsWith("222.jpeg") ? new Response(null, { status: 403 }) : new Response("jpeg", { headers: { "content-type": "image/jpeg" } });
  };

  await Promise.all([readRun(id, null), readRun(id, null)]);
  while ((await savedAt())?.at === null) await new Promise<void>((resolve) => setImmediate(resolve));

  expect(fetched.sort()).toEqual([`${host}/111.jpeg`, `${host}/222.jpeg`]);
  const files = (await db().select({ file: runMedia.file }).from(runMedia).where(eq(runMedia.runId, id))).map((row) => row.file).sort();
  expect(files).toEqual(["avatar-potter.jpg", "video-111.jpg"]);
  expect((await savedAt())?.owner).toBe(await processOwner());
  await readRun(id, null);
  expect(fetched).toHaveLength(2);
});
