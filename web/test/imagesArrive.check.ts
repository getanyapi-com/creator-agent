import { expect, test } from "vitest";
import { changesStill } from "@/data/live";
import { saveMedia } from "@/server/live/media";
import type { DisplayRun } from "@/server/live/displayTypes";
import { readRun } from "@/server/liveRun";
import { seedRun } from "./seed";

const host = "https://p16-sign.tiktokcdn-us.com";
const display = {
  question: "Find pottery creators",
  sections: [],
  creators: [{ handle: "potter", avatarUrl: `${host}/potter.jpeg`, proofVideo: { id: "111", imageUrl: `${host}/111.jpeg` } }],
  videos: [],
};

// The first user test (2026-11-22): a question finished while watched showed placeholder tiles until a reload, because the page
// stopped asking the moment the run was done, before its images were saved.
test("a run that has just finished tells the page its images are still coming, and the page asks until they have come", async () => {
  const id = "a1b2c3d4e5f6";
  await seedRun({ id, status: "done", display });

  const answered = await readRun(id, null);
  expect(answered?.status).toBe("done");
  expect(answered?.display).not.toBeNull();
  expect(answered?.media).toEqual({});
  expect(answered?.imagesPending).toBe(true);
  expect(changesStill(answered!)).toBe(true);

  globalThis.fetch = async () => new Response("jpeg", { headers: { "content-type": "image/jpeg" } });
  await saveMedia(id, display as unknown as DisplayRun);

  const pictured = await readRun(id, null);
  expect(pictured?.media).toEqual({ "avatar-potter": `/api/media/${id}/avatar-potter.jpg`, "video-111": `/api/media/${id}/video-111.jpg` });
  expect(pictured?.imagesPending).toBe(false);
  expect(changesStill(pictured!)).toBe(false);
});

test("when no image can be saved the page still stops asking, and the tiles keep their fallbacks", async () => {
  const id = "0f0e0d0c0b0a";
  await seedRun({ id, status: "done", display });
  globalThis.fetch = () => Promise.reject(new Error("image host down"));
  await saveMedia(id, display as unknown as DisplayRun);

  const run = await readRun(id, null);
  expect(run?.media).toEqual({});
  expect(run?.imagesPending).toBe(false);
  expect(changesStill(run!)).toBe(false);
});

test("a failed question has no images to wait for, so the page stops asking", async () => {
  await seedRun({ id: "222222222222", status: "failed" });
  const failed = await readRun("222222222222", null);
  expect(failed?.imagesPending).toBe(false);
  expect(changesStill(failed!)).toBe(false);
});
