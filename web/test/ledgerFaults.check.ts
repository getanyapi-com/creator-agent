import { eq, sql } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/runs/route";
import { questionAllowance } from "@/auth/questionQuota";
import { db } from "@/db";
import { houseSpend, runs } from "@/db/schema";
import { readStoredRun } from "@/server/live/store";
import { readRun } from "@/server/liveRun";
import { fakeAnyApi, ScriptedModel, services, toolCall } from "../../test/fakes.ts";
import type { ChatModel } from "../../src/llm.ts";
import type { RunOutput } from "../../src/index.ts";
import { fake, settled } from "./fakeServer";

// The reviewer's probes LOST_LEDGER, RESERVATION and PARTIAL_RETRY, run through the real route, core and database with fake providers.

const QUESTION = "Find pottery creators";

const ledger = async (runId: string, kind: "data" | "model") =>
  (await db().select().from(houseSpend).where(eq(houseSpend.runId, runId))).filter((row) => row.kind === kind).reduce((total, row) => total + Number(row.usd), 0);

async function ask(model: ChatModel): Promise<string> {
  fake.services = services(fakeAnyApi({}).make, model);
  const res = await POST(new Request("http://check.invalid/api/runs", { method: "POST", body: JSON.stringify({ question: QUESTION }) }));
  return ((await res.json()) as { id: string }).id;
}

const searchThenFinish = () =>
  new ScriptedModel([() => [toolCall("a", "search_videos", { query: "pottery wheel" })], () => [toolCall("f", "finish", { answer: "No creators found." })]], 0.0002);

async function costs(id: string): Promise<RunOutput["costs"]> {
  const [row] = await db().select({ record: runs.record }).from(runs).where(eq(runs.id, id));
  return (row?.record as RunOutput).costs;
}

/** Runs `body` with a trigger raising `failWhen` (a plpgsql condition on NEW) on every insert into house_spend, dropped afterwards. */
async function withLedgerFault(failWhen: string, body: () => Promise<void>): Promise<void> {
  await db().execute(sql.raw(`create function check_ledger_fault() returns trigger language plpgsql as $$ begin if ${failWhen} then raise exception 'injected ledger fault'; end if; return NEW; end $$`));
  await db().execute(sql`create trigger check_ledger_fault before insert on house_spend for each row execute function check_ledger_fault()`);
  try {
    await body();
  } finally {
    await db().execute(sql`drop trigger check_ledger_fault on house_spend`);
    await db().execute(sql`drop function check_ledger_fault()`);
  }
}

afterEach(() => vi.restoreAllMocks());

test("a run whose final ledger write is refused is not done, says so in the server log, and is recorded once the fault is gone (LOST_LEDGER)", async () => {
  fake.user = "lost_ledger";
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const lines = () => logged.mock.calls.map((args) => args.map(String).join(" "));
  let id = "";
  await withLedgerFault("true", async () => {
    id = await ask(searchThenFinish());
    const endRefused = () => lines().some((line) => line.includes(id) && line.includes("the end write"));
    while ((await readStoredRun(id))?.status === "running" && !endRefused()) await new Promise<void>((resolve) => setImmediate(resolve));
    expect((await readStoredRun(id))?.status).toBe("running");
    expect(await db().select().from(houseSpend).where(eq(houseSpend.runId, id))).toEqual([]);
  });
  expect(lines().some((line) => line.includes(id) && line.includes("the spend write"))).toBe(true);
  expect(lines().some((line) => line.includes(QUESTION) || line.includes("check-key-never-sent"))).toBe(false);

  expect((await readRun(id, fake.user))?.status).toBe("done");
  const spent = await costs(id);
  expect(spent.dataUsd).toBeGreaterThan(0);
  expect(await ledger(id, "data")).toBeCloseTo(spent.dataUsd, 10);
  expect(await ledger(id, "model")).toBeCloseTo(spent.modelUsd + spent.houseUsd, 10);
});

test("a question whose calls all settle at zero leaves zero in the ledger, though a reservation was written while a call was pending (RESERVATION)", async () => {
  fake.user = "reservation";
  let release!: () => void;
  let entered!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  const started = new Promise<void>((resolve) => (entered = resolve));
  const scripted = new ScriptedModel([() => [toolCall("f", "finish", { answer: "No creators found." })]], 0);
  let call = 0;
  const id = await ask({
    async complete(model, request) {
      call += 1;
      if (call === 2) {
        entered();
        await pending;
      }
      return scripted.complete(model, request);
    },
  });
  await started;
  // The intake step's progress write samples the second model call's reservation while that call is pending.
  while ((await ledger(id, "model")) === 0) await new Promise<void>((resolve) => setImmediate(resolve));
  release();
  await settled(id);
  expect((await readStoredRun(id))?.status).toBe("failed");
  expect((await questionAllowance(fake.user))?.left).toBe(2);
  expect(await ledger(id, "model")).toBe(0);
  expect(await ledger(id, "data")).toBe(0);
});

test("a ledger write whose model row fails once and is retried leaves the true amounts, not the data twice (PARTIAL_RETRY)", async () => {
  fake.user = "partial_retry";
  await db().execute(sql`create sequence check_fault_once`);
  try {
    await withLedgerFault("NEW.kind = 'model' and nextval('check_fault_once') = 1", async () => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const id = await ask(searchThenFinish());
      await settled(id);
      const spent = await costs(id);
      expect(spent.dataUsd).toBeGreaterThan(0);
      expect(await ledger(id, "data")).toBeCloseTo(spent.dataUsd, 10);
      expect(await ledger(id, "model")).toBeCloseTo(spent.modelUsd + spent.houseUsd, 10);
      expect(logged.mock.calls.some((args) => String(args[0]).includes(`${id}: the spend write failed`))).toBe(true);
    });
  } finally {
    await db().execute(sql`drop sequence check_fault_once`);
  }
});
