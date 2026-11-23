import { eq } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";
import { POST as ask } from "@/app/api/runs/route";
import { GET as readThread } from "@/app/api/runs/[id]/route";
import { questionAllowance } from "@/auth/questionQuota";
import { accountTier } from "@/auth/tier";
import { liveThread } from "@/data/liveThread";
import { db } from "@/db";
import { houseSpend, runMedia, runs } from "@/db/schema";
import { admitRun } from "@/server/live/admit";
import { newRunId } from "@/server/live/store";
import { bioEmail, liveFeed, readMedia, readRun } from "@/server/liveRun";
import { fakeAnyApi, ScriptedModel, services, toolCall } from "../../test/fakes.ts";
import type { RunOutput } from "../../src/index.ts";
import type { ToolCall } from "../../src/llm.ts";
import { fake, settled } from "./fakeServer";
import { connectWallet, walletInstance } from "./walletEnv";

let instance: ReturnType<typeof walletInstance>;
beforeEach(() => {
  instance = walletInstance();
  vi.stubEnv("NODE_ENV", "production");
});

const search = (id: string): ToolCall => toolCall(id, "search_videos", { query: `pottery ${id}` });
const finish = () => [toolCall("f", "finish", { answer: "No creators found." })];

/** A question asked through the route, by `fake.user`, researched by a model that runs `turns`, then finishes. */
async function askAndWait(turns: (() => ToolCall[])[], body: Record<string, unknown> = {}): Promise<string> {
  fake.services = services(fakeAnyApi({}).make, new ScriptedModel([...turns, finish]));
  const res = await ask(new Request("http://check.invalid/api/runs", { method: "POST", body: JSON.stringify({ question: "Find pottery creators", ...body }) }));
  const { id } = (await res.json()) as { id: string };
  await settled(id);
  return id;
}

const ledger = async (runId: string) => (await db().select().from(houseSpend).where(eq(houseSpend.runId, runId))).map((row) => ({ kind: row.kind, usd: Number(row.usd) }));

test("a connected account has no daily limit: its fifth question in a day is admitted; its data is billed to its wallet and only model spend reaches the house ledger", async () => {
  fake.user = "wallet_asker";
  await connectWallet(instance.anyapi);
  const ids = [];
  for (let i = 0; i < 5; i += 1) ids.push(await askAndWait([() => [search("a")]]));
  expect(await questionAllowance("wallet_asker")).toMatchObject({ left: 2 });
  const access = instance.anyapi.grants[0]?.access;
  expect(instance.anyapi.calls.runs.length).toBeGreaterThanOrEqual(5);
  expect(instance.anyapi.calls.runs.every((call) => call.bearer === access && call.status === 200)).toBe(true);
  for (const id of ids) {
    const [row] = await db().select({ tier: runs.tier, record: runs.record }).from(runs).where(eq(runs.id, id));
    const costs = (row?.record as RunOutput).costs;
    expect(row?.tier).toBe("wallet");
    expect(costs.dataUsd).toBeGreaterThan(0);
    const spent = await ledger(id);
    expect(spent.filter((r) => r.kind === "data")).toEqual([]);
    expect(spent.filter((r) => r.kind === "model").reduce((t, r) => t + r.usd, 0)).toBeCloseTo(costs.modelUsd + costs.houseUsd, 10);
  }
});

test("the server decides the tier: a free account that claims the wallet tier runs free and is counted, a connected one that claims free stays on its wallet", async () => {
  fake.user = "claims_wallet";
  const id = await askAndWait([() => [search("a")]], { tier: "wallet" });
  expect((await db().select({ tier: runs.tier }).from(runs).where(eq(runs.id, id)))[0]?.tier).toBe("free");
  expect(await questionAllowance("claims_wallet")).toMatchObject({ left: 1 });
  expect(instance.anyapi.calls.runs).toEqual([]);
  fake.user = "claims_free";
  await connectWallet(instance.anyapi);
  expect(await accountTier("claims_free", "free")).toBe("wallet");
});

test("a wallet question is private: to anyone but its asker it is not found, not in the feed, and neither are its images or contacts", async () => {
  fake.user = "private_asker";
  await connectWallet(instance.anyapi);
  const id = await askAndWait([() => [search("a")]]);
  await db().insert(runMedia).values({ runId: id, file: "avatar-someone.jpg", type: "image/jpeg", bytes: Buffer.from("jpg") });
  expect((await readRun(id, "private_asker"))?.tier).toBe("wallet");
  expect(await readMedia(id, "avatar-someone.jpg", "private_asker")).not.toBeNull();
  for (const viewer of ["another_account", null]) {
    expect(await readRun(id, viewer)).toBeNull();
    expect(await readMedia(id, "avatar-someone.jpg", viewer)).toBeNull();
  }
  expect(await bioEmail(id, "someone", "another_account")).toBeUndefined();
  fake.user = "another_account";
  expect((await readThread(new Request(`http://check.invalid/api/runs/${id}`), { params: Promise.resolve({ id }) })).status).toBe(404);
  expect((await liveFeed()).map((item) => item.id)).not.toContain(id);
});

test("an access token that expires during a run is refreshed and the run goes on", async () => {
  fake.user = "long_run";
  await connectWallet(instance.anyapi);
  const expire = () => {
    const grant = instance.anyapi.grants[0];
    if (grant) grant.accessExpired = true;
    return [search("b")];
  };
  const id = await askAndWait([() => [search("a")], expire]);
  expect(instance.anyapi.calls.refresh).toBe(1);
  expect(instance.anyapi.calls.runs.map((call) => call.status)).toEqual([200, 401, 200]);
  const run = await readRun(id, "long_run");
  expect(run).toMatchObject({ status: "done", walletStop: null });
});

const stops = [
  { stop: "empty", code: "insufficient_balance" },
  { stop: "capped", code: "grant_cap_exceeded" },
] as const;

for (const { stop, code } of stops) {
  test(`a wallet that is ${stop} mid-run stops the data calls, keeps what was found, and the thread says which`, async () => {
    fake.user = `stop_${stop}`;
    await connectWallet(instance.anyapi);
    instance.anyapi.refuseWallet(code, 1);
    const id = await askAndWait([() => [search("a")], () => [search("b")], () => [search("c"), search("d")]]);
    expect(instance.anyapi.calls.runs.map((call) => call.status)).toEqual([200, 402]);
    const run = await readRun(id, fake.user);
    expect(run).toMatchObject({ status: "done", walletStop: stop });
    expect(liveThread(run!).walletStop).toBe(stop);
  });
}

test("a wallet disconnected at AnyAPI mid-run stops the data calls, drops the account to free, and the thread says so", async () => {
  fake.user = "stop_disconnected";
  await connectWallet(instance.anyapi);
  const revoke = () => {
    const grant = instance.anyapi.grants[0];
    if (grant) grant.revoked = true;
    return [search("b")];
  };
  const id = await askAndWait([() => [search("a")], revoke, () => [search("c")]]);
  expect(instance.anyapi.calls.runs.map((call) => call.status)).toEqual([200, 401]);
  expect(await readRun(id, fake.user)).toMatchObject({ status: "done", walletStop: "disconnected" });
  expect(await accountTier(fake.user ?? "")).toBe("free");
});

test("the house data ceiling refuses free questions only; the model ceiling refuses wallet questions too", async () => {
  vi.stubEnv("HOUSE_DATA_CAP_USD_PER_DAY", "0.001");
  vi.stubEnv("HOUSE_LLM_CAP_USD_PER_DAY", "1");
  const day = new Date().toISOString().slice(0, 10);
  const meta = () => ({ id: newRunId(), question: "Find pottery creators", startedAt: new Date().toISOString(), status: "running" as const, error: null, finishedAt: null });
  await db().insert(houseSpend).values({ day, kind: "data", runId: "ceiling", usd: "0.001" });
  expect(await admitRun(meta(), "ceiling_free", "free")).toEqual({ refused: "house-cap", tier: "free" });
  expect(await admitRun(meta(), "ceiling_wallet", "wallet")).toEqual({ admitted: true });
  await db().insert(houseSpend).values({ day, kind: "model", runId: "ceiling", usd: "1" });
  expect(await admitRun(meta(), "ceiling_wallet", "wallet")).toEqual({ refused: "house-cap", tier: "wallet" });
  await db().delete(houseSpend).where(eq(houseSpend.runId, "ceiling"));
});
