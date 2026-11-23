import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { videoSlot } from "@/server/live/videoSlots";

// Each check starts with no inspection running in this process.
beforeEach(() => {
  delete (globalThis as { __creatorVideoSlots?: unknown }).__creatorVideoSlots;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("with VIDEO_INSPECTIONS_AT_ONCE unset, inspections do not wait", () => {
  expect(videoSlot()).toBeUndefined();
});

test("with VIDEO_INSPECTIONS_AT_ONCE set, inspections from every question share its places and the next starts when one ends, in the order they asked", async () => {
  vi.stubEnv("VIDEO_INSPECTIONS_AT_ONCE", "2");
  const started: string[] = [];
  const ends = new Map<string, () => void>();
  const inspect = (name: string) =>
    videoSlot()!(async () => {
      started.push(name);
      await new Promise<void>((done) => ends.set(name, done));
    });
  const all = ["a", "b", "c", "d"].map(inspect);
  await new Promise((r) => setImmediate(r));
  expect(started).toEqual(["a", "b"]);
  ends.get("b")!();
  await new Promise((r) => setImmediate(r));
  expect(started).toEqual(["a", "b", "c"]);
  ends.get("a")!();
  await new Promise((r) => setImmediate(r));
  expect(started).toEqual(["a", "b", "c", "d"]);
  ends.get("c")!();
  ends.get("d")!();
  await Promise.all(all);
});
