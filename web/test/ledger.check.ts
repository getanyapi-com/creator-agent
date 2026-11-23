import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { POST } from "@/app/api/runs/route";
import { db } from "@/db";
import { houseSpend, runs } from "@/db/schema";
import { RunSpend, writeSpend } from "@/server/live/houseSpend";
import { fakeAnyApi, ScriptedModel, services, toolCall } from "../../test/fakes.ts";
import type { RunOutput } from "../../src/index.ts";
import { fake, settled } from "./fakeServer";

const ledger = async (runId: string) =>
  (await db().select().from(houseSpend).where(eq(houseSpend.runId, runId))).map((row) => ({ day: row.day, kind: row.kind, usd: Number(row.usd) }));

test("spend is recorded by UTC day and kind as a state: a closed day keeps what was billed on it, a repeated write changes nothing", async () => {
  const before = new Date("2026-11-21T23:59:00Z");
  const after = new Date("2026-11-22T00:01:00Z");
  const spend = new RunSpend(["data", "model"]);
  const reserved = { data: 0, model: 0 };
  await writeSpend(db(), "ffffffffffff", spend.rows({ spent: { data: 0.003, model: 0.001 }, reserved }, before));
  // A data call and a model call are pending at 23:59, and settle after midnight: their reservations are not the 21st's.
  await writeSpend(db(), "ffffffffffff", spend.rows({ spent: { data: 0.0056, model: 0.003 }, reserved: { data: 0.0006, model: 0.002 } }, before));
  const last = spend.rows({ spent: { data: 0.006, model: 0.004 }, reserved }, after);
  await writeSpend(db(), "ffffffffffff", last);
  await writeSpend(db(), "ffffffffffff", last);
  const rows = (await ledger("ffffffffffff")).sort((a, b) => `${a.day}${a.kind}`.localeCompare(`${b.day}${b.kind}`));
  expect(rows).toEqual([
    { day: "2026-11-21", kind: "data", usd: 0.005 },
    { day: "2026-11-21", kind: "model", usd: 0.001 },
    { day: "2026-11-22", kind: "data", usd: expect.closeTo(0.001, 10) },
    { day: "2026-11-22", kind: "model", usd: expect.closeTo(0.003, 10) },
  ]);
});

test("a free run's data and model spend reach the ledger and match what the run recorded", async () => {
  fake.user = "ledger_account";
  const model = new ScriptedModel([() => [toolCall("a", "search_videos", { query: "pottery wheel" })], () => [toolCall("f", "finish", { answer: "No creators found." })]], 0.0002);
  fake.services = services(fakeAnyApi({}).make, model);
  const res = await POST(new Request("http://check.invalid/api/runs", { method: "POST", body: JSON.stringify({ question: "Find pottery creators" }) }));
  const { id } = (await res.json()) as { id: string };
  await settled(id);
  const [row] = await db().select({ record: runs.record }).from(runs).where(eq(runs.id, id));
  const costs = (row?.record as RunOutput).costs;
  const spent = await ledger(id);
  const sum = (kind: string) => spent.filter((r) => r.kind === kind).reduce((total, r) => total + r.usd, 0);
  expect(costs.dataUsd).toBeGreaterThan(0);
  expect(sum("data")).toBeCloseTo(costs.dataUsd, 10);
  expect(sum("model")).toBeCloseTo(costs.modelUsd + costs.houseUsd, 10);
});
