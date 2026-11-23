import { sql } from "drizzle-orm";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { db } from "@/db";
import { walletConnections } from "@/db/schema";
import { disconnectWallet, walletAccessToken } from "@/server/wallet/connection";
import { OAuthUnavailableError } from "@/server/wallet/oauth";
import { walletFetch } from "@/server/wallet/walletFetch";
import { CALL_TIMEOUT_MS } from "../../src/anyapi.ts";
import { fake } from "./fakeServer";
import { connectWallet, walletInstance } from "./walletEnv";

// The reviewer's HUNG_REFRESH probe, as a check: AnyAPI's OAuth server
// answers with a body that never finishes, or never answers at all, whatever signal the request carries.

let instance: ReturnType<typeof walletInstance>;
beforeEach(async () => {
  instance = walletInstance();
  fake.user = "owner";
  await db().execute(sql`truncate wallet_connections`);
  await connectWallet(instance.anyapi);
});
afterEach(() => vi.restoreAllMocks());

const connections = () => db().select().from(walletConnections);

/** Answers OAuth `path` with `stall` and everything else as the fake AnyAPI does; resolves `entered` once it is asked. */
function stallOAuth(path: string, stall: () => Promise<Response>): Promise<void> {
  return new Promise<void>((entered) => {
    globalThis.fetch = async (input, init) => {
      if (!String(input).endsWith(path)) return instance.anyapi.fetch(input, init);
      entered();
      return stall();
    };
  });
}

const stalledBody = async () => new Response(new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(new TextEncoder().encode("{")) }), { headers: { "content-type": "application/json" } });
const neverAnswered = () => new Promise<Response>(() => undefined);

test("a refresh whose response body stalls ends when the data request is given up on, and Disconnect is not held behind its lock", async () => {
  await db().update(walletConnections).set({ accessTokenExpiresAt: new Date(0) });
  const entered = stallOAuth("/oauth/token", stalledBody);
  const controller = new AbortController();
  const request = walletFetch("owner").fetchFn("https://api.getanyapi.com/v1/run/test", { signal: controller.signal });
  await entered;
  controller.abort();
  await expect(request).rejects.toBeInstanceOf(OAuthUnavailableError);
  await disconnectWallet("owner");
  expect(await connections()).toEqual([]);
});

test("a refresh no one gives up on ends at the data call's deadline and keeps the connection", async () => {
  await db().update(walletConnections).set({ accessTokenExpiresAt: new Date(0) });
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  const entered = stallOAuth("/oauth/token", stalledBody);
  const token = walletAccessToken("owner");
  await entered;
  expect(timeout).toHaveBeenCalledWith(CALL_TIMEOUT_MS);
  deadline.abort();
  await expect(token).rejects.toBeInstanceOf(OAuthUnavailableError);
  expect(await connections()).toHaveLength(1);
});

test("Disconnect deletes here first and returns when a revoke AnyAPI never answers passes the deadline, logging one line without a token", async () => {
  const grant = instance.anyapi.grants[0]!;
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const entered = stallOAuth("/oauth/revoke", neverAnswered);
  const disconnect = disconnectWallet("owner");
  await entered;
  expect(await connections()).toEqual([]);
  expect(timeout).toHaveBeenCalledWith(CALL_TIMEOUT_MS);
  deadline.abort();
  await disconnect;
  expect(logged).toHaveBeenCalledOnce();
  const line = logged.mock.calls.flat().join(" ");
  expect(line).not.toContain(grant.refresh);
  expect(line).not.toContain(grant.access);
});
