import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST as reveal } from "@/app/api/reveal/route";
import { POST as ask } from "@/app/api/runs/route";
import { questionAllowance, QUESTIONS_PER_DAY } from "@/auth/questionQuota";
import { WALLET_ENDED, WALLET_UNREACHABLE } from "@/auth/tier";
import { db } from "@/db";
import { runs, walletConnections } from "@/db/schema";
import { readStoredRun } from "@/server/live/store";
import { fakeAnyApi, ScriptedModel, services, toolCall } from "../../test/fakes.ts";
import { APP_URL } from "./fakeAnyApi";
import { fake, settled } from "./fakeServer";
import { seedRun } from "./seed";
import { connectWallet, walletInstance } from "./walletEnv";

// The reviewer's STALE_ENTITLEMENT probe, as a check.

let instance: ReturnType<typeof walletInstance>;
beforeEach(async () => {
  instance = walletInstance();
  vi.stubEnv("NODE_ENV", "production");
  fake.user = "owner";
  await db().execute(sql`truncate runs, wallet_connections, run_media, question_claims, house_spend`);
});
afterEach(() => vi.unstubAllEnvs());

const id = "aabbccdd0001";
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

/** A connection the user ended at AnyAPI, whose access token has since expired. */
async function endedAndExpired(): Promise<void> {
  await connectWallet(instance.anyapi);
  instance.anyapi.grants[0]!.revoked = true;
  await db().update(walletConnections).set({ accessTokenExpiresAt: new Date(0) });
}

test("Reveal on an ended, expired connection refreshes first, deletes the connection and answers as the free tier", async () => {
  await endedAndExpired();
  await seedContact();
  expect(await (await pressReveal()).json()).toEqual({ kind: "needs-wallet" });
  expect(instance.anyapi.calls.refresh).toBe(1);
  expect(await connections()).toEqual([]);
});

// Ruled 2026-11-22: a question asked on a connection AnyAPI has just ended is refused, not run in public, and counts nothing.
test("a question on an ended, expired connection is refused with nothing counted and the connection deleted; the next one runs as free", async () => {
  await endedAndExpired();
  const refused = await askOne();
  expect(refused.status).toBe(409);
  expect(await refused.json()).toEqual({ error: WALLET_ENDED });
  expect(instance.anyapi.calls.refresh).toBe(1);
  expect(await connections()).toEqual([]);
  expect(await db().select().from(runs)).toEqual([]);
  expect((await questionAllowance("owner"))?.left).toBe(QUESTIONS_PER_DAY);

  const { id: runId } = (await (await askOne()).json()) as { id: string };
  await settled(runId);
  expect((await readStoredRun(runId))?.tier).toBe("free");
  expect((await questionAllowance("owner"))?.left).toBe(QUESTIONS_PER_DAY - 1);
});

test("an access token in date is used without a refresh; a refresh AnyAPI cannot answer keeps the connection and grants nothing, with a message to try again", async () => {
  await connectWallet(instance.anyapi);
  await seedContact();
  const tokenCalls = instance.anyapi.calls.token;
  expect(await (await pressReveal()).json()).toMatchObject({ kind: "revealed", placeholder: false });
  expect(instance.anyapi.calls.token).toBe(tokenCalls);

  await db().update(walletConnections).set({ accessTokenExpiresAt: new Date(0) });
  const outages: (typeof fetch)[] = [() => Promise.reject(new TypeError("fetch failed")), async () => new Response("unavailable", { status: 503 })];
  for (const outage of outages) {
    globalThis.fetch = outage;
    for (const res of [await pressReveal(), await askOne()]) {
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: WALLET_UNREACHABLE });
    }
  }
  expect(await connections()).toHaveLength(1);
  expect((await questionAllowance("owner"))?.left).toBe(QUESTIONS_PER_DAY);
});
