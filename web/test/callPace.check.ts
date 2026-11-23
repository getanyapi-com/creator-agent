import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { db } from "@/db";
import { CallPace, pacedFetch } from "@/server/live/callPace";
import { walletFetch } from "@/server/wallet/walletFetch";
import { AnyApiClient, CALL_TIMEOUT_MS } from "../../src/anyapi.ts";
import { Budget } from "../../src/budget.ts";
import { tablePrices } from "../../src/prices.ts";
import { fake } from "./fakeServer";
import { connectWallet, walletInstance } from "./walletEnv";

// Each check starts with no call sent yet in this process.
beforeEach(() => {
  delete (globalThis as { __creatorCallPace?: unknown }).__creatorCallPace;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A clock that moves only when the check moves it, and the waits CallPace asked for, released as the clock passes them. */
function fakeClock() {
  let now = 0;
  const waits: { until: number; done: () => void }[] = [];
  const wait = (ms: number) => new Promise<void>((done) => waits.push({ until: now + ms, done }));
  const advance = async (ms: number) => {
    now += ms;
    for (const w of waits.filter((w) => w.until <= now)) w.done();
    await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  };
  return { now: () => now, wait, advance };
}

test("N calls a minute: the N+1th starts only once the minute has moved on, calls are evenly spaced, and they start in the order they asked", async () => {
  const clock = fakeClock();
  const pace = new CallPace(clock.now, clock.wait);
  const perMinute = 4;
  const spacing = 60_000 / perMinute;
  const started: { call: number; at: number }[] = [];
  const calls = Array.from({ length: perMinute + 1 }, (_, call) => pace.turn(spacing).then(() => started.push({ call, at: clock.now() })));
  await clock.advance(0);
  expect(started).toEqual([{ call: 0, at: 0 }]);
  await clock.advance(spacing - 1);
  expect(started).toHaveLength(1);
  for (let i = 0; i < perMinute; i++) await clock.advance(i === 0 ? 1 : spacing);
  await Promise.all(calls);
  expect(started).toEqual([0, 1, 2, 3, 4].map((call) => ({ call, at: call * spacing })));
  expect(started.at(-1)?.at).toBe(60_000);
});

test("after a stall past several turns, the waiting calls still go one spacing apart, in the order they asked", async () => {
  const clock = fakeClock();
  const pace = new CallPace(clock.now, clock.wait);
  const spacing = 1000;
  const started: { call: number; at: number }[] = [];
  const calls = Array.from({ length: 4 }, (_, call) => pace.turn(spacing).then(() => started.push({ call, at: clock.now() })));
  await clock.advance(0);
  // The event loop is held up: the clock jumps past three calls' turns at once.
  await clock.advance(3 * spacing);
  expect(started).toEqual([
    { call: 0, at: 0 },
    { call: 1, at: 3000 },
  ]);
  await clock.advance(spacing - 1);
  expect(started).toHaveLength(2);
  await clock.advance(1);
  await clock.advance(spacing);
  await Promise.all(calls);
  expect(started).toEqual([0, 3000, 4000, 5000].map((at, call) => ({ call, at })));
});

test("a call after a quiet spell goes at once", async () => {
  const clock = fakeClock();
  const pace = new CallPace(clock.now, clock.wait);
  await pace.turn(15_000);
  await clock.advance(60_000);
  let went = false;
  void pace.turn(15_000).then(() => (went = true));
  await clock.advance(0);
  expect(went).toBe(true);
});

test("with DATA_CALLS_PER_MINUTE unset, data calls are sent at once", async () => {
  const sent: string[] = [];
  globalThis.fetch = async (input) => {
    sent.push(String(input));
    return new Response("{}");
  };
  await Promise.all(Array.from({ length: 50 }, (_, i) => pacedFetch(`https://api.getanyapi.com/v1/run/c${i}`, { method: "POST" })));
  expect(sent).toHaveLength(50);
});

test("a call's deadline does not run while it waits its turn", async () => {
  vi.useFakeTimers();
  vi.stubEnv("DATA_CALLS_PER_MINUTE", "1");
  const deadlines = vi.spyOn(AbortSignal, "timeout");
  const sent: number[] = [];
  globalThis.fetch = async () => {
    sent.push(Date.now());
    return Response.json({ costUsd: 0, output: { data: null } });
  };
  const client = new AnyApiClient("k", new Budget(1), tablePrices(), pacedFetch);
  // Takes the turn now; the next turn is a minute away.
  await client.run("tiktok.profile", { handle: "a" });
  expect(deadlines).toHaveBeenCalledTimes(1);
  expect(deadlines).toHaveBeenCalledWith(CALL_TIMEOUT_MS);
  const second = client.run("tiktok.profile", { handle: "b" });
  await vi.advanceTimersByTimeAsync(59_999);
  expect(deadlines).toHaveBeenCalledTimes(1);
  expect(sent).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  await second;
  expect(deadlines).toHaveBeenCalledTimes(2);
  expect(sent[1]! - sent[0]!).toBe(60_000);
});

test("a wallet call AnyAPI refuses with 401 is tried again on a fresh token only after a turn of its own", async () => {
  const instance = walletInstance();
  fake.user = "paced_wallet";
  await db().execute(sql`truncate wallet_connections`);
  await connectWallet(instance.anyapi);
  const grant = instance.anyapi.grants[0]!;
  grant.accessExpired = true;
  const perMinute = 1200;
  vi.stubEnv("DATA_CALLS_PER_MINUTE", String(perMinute));
  const posted: number[] = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("/v1/run/")) posted.push(Date.now());
    return instance.anyapi.fetch(input, init);
  };
  const res = await walletFetch("paced_wallet").fetchFn("https://api.getanyapi.com/v1/run/tiktok.profile", { method: "POST" });
  expect(res.status).toBe(200);
  expect(instance.anyapi.calls.runs.map((call) => call.status)).toEqual([401, 200]);
  // Node's timers count whole milliseconds and may fire up to one early against Date.now.
  expect(posted[1]! - posted[0]!).toBeGreaterThanOrEqual(60_000 / perMinute - 1);
});
