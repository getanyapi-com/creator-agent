import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST as reveal } from "@/app/api/reveal/route";
import { POST as ask } from "@/app/api/runs/route";
import { questionAllowance, QUESTIONS_PER_DAY } from "@/auth/questionQuota";
import { WALLET_ENDED, WALLET_UNFUNDED } from "@/auth/tier";
import { db } from "@/db";
import { houseSpend, runs, walletConnections } from "@/db/schema";
import { readStoredRun } from "@/server/live/store";
import { fakeAnyApi, ScriptedModel, services, toolCall } from "../../test/fakes.ts";
import { FREE_BUDGET_USD } from "../../src/index.ts";
import { APP_URL } from "./fakeAnyApi";
import { fake, settled } from "./fakeServer";
import { seedRun } from "./seed";
import { connectWallet, walletInstance } from "./walletEnv";

// The reviewer's REVOKED_UNEXPIRED and CONCURRENT_REVOKED_ASK probes, as checks,
// with the wallet that cannot pay for a question beside them.

let instance: ReturnType<typeof walletInstance>;
beforeEach(async () => {
  instance = walletInstance();
  vi.stubEnv("NODE_ENV", "production");
  fake.user = "owner";
  await db().execute(sql`truncate runs, wallet_connections, run_media, question_claims, house_spend`);
});
afterEach(() => vi.unstubAllEnvs());

const id = "aabbccdd0002";
const handle = "synthetic";
const seedContact = () =>
  seedRun({
    id,
    status: "done",
    display: { question: "Find creators", sections: [], creators: [{ handle, hasPublicEmail: true }], videos: [] },
    record: { contacts: { [handle]: [{ source: "bio", kind: "email", value: `${handle}@example.com` }] } },
  });
const pressReveal = () => reveal(new Request(`${APP_URL}/api/reveal`, { method: "POST", body: JSON.stringify({ threadId: id, handle }) }));
const askOne = () => {
  fake.services = services(fakeAnyApi({}).make, new ScriptedModel([() => [toolCall("f", "finish", { answer: "No creators found." })]]));
  return ask(new Request(`${APP_URL}/api/runs`, { method: "POST", body: JSON.stringify({ question: "Find pottery creators" }) }));
};
const connections = () => db().select().from(walletConnections);

/** Nothing was run, counted or spent on the house for the account. */
async function expectNothingRun(): Promise<void> {
  expect(await db().select().from(runs)).toEqual([]);
  expect(await db().select().from(houseSpend)).toEqual([]);
  expect((await questionAllowance("owner"))?.left).toBe(QUESTIONS_PER_DAY);
}

/** A connection the user ended at AnyAPI while its access token here is still in date. */
async function revokedUnexpired(): Promise<void> {
  await connectWallet(instance.anyapi);
  instance.anyapi.grants[0]!.revoked = true;
}

test("Reveal on a connection ended at AnyAPI whose token is still in date asks AnyAPI, deletes the connection and needs a wallet", async () => {
  await revokedUnexpired();
  await seedContact();
  expect(await (await pressReveal()).json()).toEqual({ kind: "needs-wallet" });
  expect(instance.anyapi.calls.balance).toBe(1);
  expect(instance.anyapi.calls.refresh).toBe(1);
  expect(await connections()).toEqual([]);
});

test("a question on a connection ended at AnyAPI whose token is still in date is refused with nothing counted and no house spend", async () => {
  await revokedUnexpired();
  const refused = await askOne();
  expect(refused.status).toBe(409);
  expect(await refused.json()).toEqual({ error: WALLET_ENDED });
  expect(await connections()).toEqual([]);
  await expectNothingRun();
});

test("a wallet holding less than one question's budget refuses the question, keeps the connection, and still reveals", async () => {
  await connectWallet(instance.anyapi);
  // One cent short of the budget: the smallest shortfall a balance in cents can show.
  instance.anyapi.setBalance(FREE_BUDGET_USD - 0.01);
  const refused = await askOne();
  expect(refused.status).toBe(402);
  expect(await refused.json()).toEqual({ error: WALLET_UNFUNDED });
  expect(await connections()).toHaveLength(1);
  await expectNothingRun();
  await seedContact();
  expect(await (await pressReveal()).json()).toMatchObject({ kind: "revealed", placeholder: false });
});

test("a funded wallet's question runs on the wallet after exactly one check with AnyAPI", async () => {
  await connectWallet(instance.anyapi);
  instance.anyapi.setBalance(FREE_BUDGET_USD);
  const res = await askOne();
  expect(res.status).toBe(200);
  const { id: runId } = (await res.json()) as { id: string };
  await settled(runId);
  expect((await readStoredRun(runId))?.tier).toBe("wallet");
  expect(instance.anyapi.calls.balance).toBe(1);
  expect(instance.anyapi.calls.refresh).toBe(0);
});

test("two questions at once on an expired connection AnyAPI has ended are both refused; the next one runs as free", async () => {
  await revokedUnexpired();
  await db().update(walletConnections).set({ accessTokenExpiresAt: new Date(0) });
  let release!: () => void;
  let enter!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const entered = new Promise<void>((r) => (enter = r));
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/oauth/token")) {
      enter();
      await held;
    }
    return instance.anyapi.fetch(input, init);
  };
  const first = askOne();
  await entered;
  const second = askOne();
  // Postgres must show the second request waiting on the connection's row lock before the first one's refresh is answered.
  let waiting = false;
  while (!waiting) {
    const rows = await db().execute(sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%wallet_connections%for update%'`);
    waiting = rows.length > 0;
    await new Promise<void>((r) => setImmediate(r));
  }
  release();
  const responses = await Promise.all([first, second]);
  expect(responses.map((r) => r.status)).toEqual([409, 409]);
  await expectNothingRun();

  const { id: runId } = (await (await askOne()).json()) as { id: string };
  await settled(runId);
  expect((await readStoredRun(runId))?.tier).toBe("free");
});
