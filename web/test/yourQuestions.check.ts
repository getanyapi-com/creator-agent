import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { removeRun, yourQuestions } from "@/server/liveRun";
import { seedRun } from "./seed";

/** A real display object: the recorded answer with no creators. */
const display = (JSON.parse(readFileSync("fixtures/q12-my-app.json", "utf8")) as { display: unknown }).display;

/** A run asked by `askerId` on `tier`, `minutesAgo` before now. */
async function asked(id: string, askerId: string, tier: "free" | "wallet", minutesAgo: number, status: "done" | "running" | "failed" = "done"): Promise<void> {
  await seedRun({ id, status, askerId, display: status === "done" ? display : undefined });
  await db()
    .update(runs)
    .set({ tier, startedAt: new Date(Date.now() - minutesAgo * 60_000) })
    .where(eq(runs.id, id));
}

test("an account's own questions: newest first, private marked, removed ones gone, never another account's", async () => {
  await asked("aaaaaaaaaaa1", "me", "free", 30);
  await asked("aaaaaaaaaaa2", "me", "wallet", 20);
  await asked("aaaaaaaaaaa3", "me", "wallet", 10, "running");
  await asked("aaaaaaaaaaa4", "me", "free", 5);
  await asked("bbbbbbbbbbb1", "someone-else", "free", 1);
  await asked("bbbbbbbbbbb2", "someone-else", "wallet", 2);
  expect(await removeRun("aaaaaaaaaaa4", "me")).toBe("removed");

  const mine = await yourQuestions("me");
  expect(mine.total).toBe(3);
  expect(mine.items.map((item) => [item.id, item.private, item.status])).toEqual([
    ["aaaaaaaaaaa3", true, "running"],
    ["aaaaaaaaaaa2", true, "done"],
    ["aaaaaaaaaaa1", false, "done"],
  ]);
  // The other account sees only its own, and an account that asked nothing gets nothing.
  expect((await yourQuestions("someone-else")).items.map((item) => item.id)).toEqual(["bbbbbbbbbbb1", "bbbbbbbbbbb2"]);
  expect(await yourQuestions("nobody")).toEqual({ items: [], total: 0 });
});

test("an account with more questions than the front page shows gets the six newest and the count of all", async () => {
  for (let i = 0; i < 8; i += 1) await asked(`ccccccccccc${i}`, "busy", "free", 100 - i);
  const busy = await yourQuestions("busy");
  expect(busy.total).toBe(8);
  expect(busy.items.map((item) => item.id)).toEqual(["ccccccccccc7", "ccccccccccc6", "ccccccccccc5", "ccccccccccc4", "ccccccccccc3", "ccccccccccc2"]);
});
