import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { POST } from "@/app/api/reveal/route";
import { CLOSE_HEADING, toThread } from "@/data/adapter";
import type { DisplayRun } from "@/server/live/displayTypes";
import { saveMedia } from "@/server/live/media";
import { readRun } from "@/server/liveRun";
import { fake } from "./fakeServer";
import { seedRun } from "./seed";

const host = "https://p16-sign.tiktokcdn-us.com";
const email = "close.creator@example.com";
const missed = "14,200 followers, asked for at most 10,000 followers";
const closeCreator = { handle: "near", hasPublicEmail: true, missed, avatarUrl: `${host}/near.jpeg`, proofVideo: { id: "333", imageUrl: `${host}/333.jpeg` }, criteria: [] };
const display = { question: "Find study creators", sections: [], creators: [], close: [closeCreator], videos: [] };

/** A recorded answer from before close creators existed: its display object has no `close`. */
const saved = (JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "q02-claude-sub10k.json"), "utf8")) as { display: DisplayRun }).display;
const thread = (d: DisplayRun) => toThread({ id: "t", askedAt: null, tier: "free", walletStop: null, display: d, media: () => undefined });

test("a thread saved before close creators existed has no close section and its own sections as before", () => {
  expect(saved.close).toBeUndefined();
  const before = thread(saved);
  expect(before.close).toBeNull();
  expect(before.sections.map((s) => [s.heading, s.creators.map((c) => c.handle)])).toEqual(saved.sections.map((s) => [s.heading, s.creators.map((c) => c.handle)]));
});

test("close creators become one section after the answer's own, each tile carrying the limit it misses", () => {
  const view = thread({ ...saved, close: [{ ...saved.creators[0]!, handle: "near", missed }] });
  expect(view.sections).toEqual(thread(saved).sections);
  expect(view.close).toMatchObject({ kind: "group", heading: CLOSE_HEADING, reason: null, creators: [{ handle: "near", missed }] });
});

test("the media saver saves a close creator's avatar and cover, and Reveal answers for a close creator", async () => {
  const id = "c1c2c3c4c5c6";
  await seedRun({ id, status: "done", display, record: { contacts: { near: [{ source: "bio", kind: "email", value: email }] } } });
  globalThis.fetch = async () => new Response("jpeg", { headers: { "content-type": "image/jpeg" } });
  await saveMedia(id, display as unknown as DisplayRun);
  expect((await readRun(id, null))?.media).toEqual({ "avatar-near": `/api/media/${id}/avatar-near.jpg`, "video-333": `/api/media/${id}/video-333.jpg` });

  fake.user = "free_account";
  vi.stubEnv("NODE_ENV", "development");
  const res = await POST(new Request("http://check.invalid/api/reveal", { method: "POST", body: JSON.stringify({ threadId: id, handle: "near", tier: "wallet" }) }));
  expect(await res.json()).toEqual({ kind: "revealed", email, placeholder: false });
  vi.unstubAllEnvs();
});
