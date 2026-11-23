import { eq, sql } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { DELETE as remove } from "@/app/api/runs/[id]/route";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { APP_URL } from "./fakeAnyApi";
import { fake } from "./fakeServer";
import { seedRun } from "./seed";

// The reviewer's PRIVATE_DELETE probe, as a check.

const id = "aabbccddeeff";
beforeEach(async () => {
  await db().execute(sql`truncate runs`);
  await seedRun({ id, status: "done", askerId: "owner" });
  fake.user = "other";
});

const del = async (runId: string) => {
  const res = await remove(new Request(APP_URL, { method: "DELETE" }), { params: Promise.resolve({ id: runId }) });
  return { status: res.status, body: await res.text() };
};

test("another account's DELETE of a private wallet question answers exactly what an unknown id answers", async () => {
  await db().update(runs).set({ tier: "wallet" }).where(eq(runs.id, id));
  const missing = await del("112233445566");
  expect(missing.status).toBe(404);
  expect(await del(id)).toEqual(missing);
});

test("another account's DELETE of a public question is still refused as not theirs", async () => {
  expect((await del(id)).status).toBe(403);
});
