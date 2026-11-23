import { count, sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/runs/route";
import { questionAllowance } from "@/auth/questionQuota";
import { db } from "@/db";
import { houseSpend, questionClaims, runs } from "@/db/schema";
import { admitRun } from "@/server/live/admit";
import { newRunId, type RunMeta } from "@/server/live/store";
import { readRun } from "@/server/liveRun";
import { fake } from "./fakeServer";
import { DEAD_OWNER, seedRun } from "./seed";

const ask = (body: BodyInit) => POST(new Request("http://check.invalid/api/runs", { method: "POST", body }));
const askQuestion = (question: string) => ask(JSON.stringify({ question }));
const counted = async () => (await db().select({ n: count() }).from(questionClaims))[0]?.n;
const started = async () => (await db().select({ n: count() }).from(runs))[0]?.n;
const today = () => new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  await db().execute(sql`truncate runs, question_claims, house_spend, run_media`);
  fake.user = "limited_account";
  // No research starts in these checks: an admitted question fails at once, having spent nothing, and is given back.
  fake.services = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("a question longer than MAX_QUESTION_CHARS is refused with 400 before anything is counted or run", async () => {
  vi.stubEnv("MAX_QUESTION_CHARS", "20");
  const res = await askQuestion("a".repeat(21));
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toBe("Questions can be at most 20 characters.");
  expect(await counted()).toBe(0);
  expect(await started()).toBe(0);
});

test("a body larger than any allowed question needs is refused with 400, whether or not it declares its length", async () => {
  vi.stubEnv("MAX_QUESTION_CHARS", "20");
  const big = JSON.stringify({ question: "a", padding: "x".repeat(1000) });
  expect((await ask(big)).status).toBe(400);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(big));
      controller.close();
    },
  });
  const undeclared = new Request("http://check.invalid/api/runs", { method: "POST", body: stream, duplex: "half" } as RequestInit);
  expect((await POST(undeclared)).status).toBe(400);
  expect(await counted()).toBe(0);
  expect(await started()).toBe(0);
});

test("with RUNS_IN_FLIGHT questions running, the next asker is told the service is busy and is not counted", async () => {
  vi.stubEnv("RUNS_IN_FLIGHT", "1");
  await seedRun({ id: "aaaaaaaaaaaa", status: "running" });
  const res = await askQuestion("Find pottery creators");
  expect(res.status).toBe(503);
  expect(((await res.json()) as { error: string }).error).toMatch(/^Too many questions are being researched right now/);
  expect((await questionAllowance("limited_account"))?.left).toBe(2);
  expect(await started()).toBe(1);
});

test("with RUNS_IN_FLIGHT unset, questions are admitted past any number already running", async () => {
  for (let i = 0; i < 20; i++) await seedRun({ id: `${i}`.padStart(12, "a"), status: "running", askerId: `asker_${i}` });
  expect((await askQuestion("Find pottery creators")).status).toBe(200);
});

const AT_ONCE = "You already have 2 questions being researched. Ask again when one finishes.";

test("an account with two questions running is refused a third with 429, and it is not counted", async () => {
  await seedRun({ id: "aaaaaaaaaaa1", status: "running", askerId: "limited_account" });
  await seedRun({ id: "aaaaaaaaaaa2", status: "running", askerId: "limited_account" });
  const res = await askQuestion("Find pottery creators");
  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({ error: AT_ONCE });
  expect((await questionAllowance("limited_account"))?.left).toBe(2);
  expect(await started()).toBe(2);
});

test("a wallet account with two questions running is refused a third and nothing is saved", async () => {
  await seedRun({ id: "aaaaaaaaaaa1", status: "running", askerId: "wallet_account" });
  await seedRun({ id: "aaaaaaaaaaa2", status: "running", askerId: "wallet_account" });
  const meta: RunMeta = { id: newRunId(), question: "Find pottery creators", startedAt: new Date().toISOString(), status: "running", error: null, finishedAt: null };
  expect(await admitRun(meta, "wallet_account", "wallet")).toEqual({ refused: "at-once" });
  expect(await started()).toBe(2);
});

test("a run whose process died does not count toward the account's two at once", async () => {
  await seedRun({ id: "aaaaaaaaaaa1", status: "running", askerId: "limited_account" });
  await seedRun({ id: "aaaaaaaaaaa2", status: "running", askerId: "limited_account", owner: DEAD_OWNER });
  expect((await askQuestion("Find pottery creators")).status).toBe(200);
});

test("SELF_HOSTED=true removes the account's limit on questions at once", async () => {
  vi.stubEnv("SELF_HOSTED", "true");
  await seedRun({ id: "aaaaaaaaaaa1", status: "running", askerId: "limited_account" });
  await seedRun({ id: "aaaaaaaaaaa2", status: "running", askerId: "limited_account" });
  expect((await askQuestion("Find pottery creators")).status).toBe(200);
});

test("a question left running by a dead process does not take a place, and is ended and given back when read", async () => {
  vi.stubEnv("RUNS_IN_FLIGHT", "1");
  await seedRun({ id: "bbbbbbbbbbbb", status: "running", owner: DEAD_OWNER, askerId: "limited_account" });
  await db().insert(questionClaims).values({ runId: "bbbbbbbbbbbb", accountId: "limited_account", at: new Date() });
  expect((await askQuestion("Find pottery creators")).status).toBe(200);
  const dead = await readRun("bbbbbbbbbbbb", null);
  expect(dead?.status).toBe("failed");
  expect(dead?.error).toBe("The server restarted while this question was being researched.");
  expect(await db().select().from(questionClaims).where(sql`${questionClaims.runId} = 'bbbbbbbbbbbb'`)).toHaveLength(0);
});

test.each(["data", "model"] as const)("once today's house %s spend reaches its ceiling, free questions are refused and not counted", async (kind) => {
  vi.stubEnv("HOUSE_DATA_CAP_USD_PER_DAY", "50");
  vi.stubEnv("HOUSE_LLM_CAP_USD_PER_DAY", "10");
  const ceiling = kind === "data" ? "50" : "10";
  await db().insert(houseSpend).values({ day: "2000-01-01", kind, runId: "cccccccccccc", usd: ceiling });
  await db().insert(houseSpend).values({ day: today(), kind, runId: "dddddddddddd", usd: String(Number(ceiling) - 0.01) });
  // Yesterday's spend and spend under the ceiling leave questions open.
  expect((await askQuestion("Find pottery creators")).status).toBe(200);
  await db().insert(houseSpend).values({ day: today(), kind, runId: "eeeeeeeeeeee", usd: "0.01" });
  const res = await askQuestion("Find pottery creators");
  expect(res.status).toBe(503);
  expect(((await res.json()) as { error: string }).error).toBe("Today's free research budget is used up. Free questions open again at midnight UTC.");
  expect(await started()).toBe(1);
});

test("SELF_HOSTED=true removes the per-account limit", async () => {
  vi.stubEnv("SELF_HOSTED", "true");
  for (let i = 0; i < 3; i++) expect((await askQuestion("Find pottery creators")).status).toBe(200);
  expect(await questionAllowance("limited_account")).toBeNull();
});
