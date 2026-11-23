import { eq } from "drizzle-orm";
import { beforeEach, expect, test } from "vitest";
import { POST as disconnect } from "@/app/connect/disconnect/route";
import { accountTier } from "@/auth/tier";
import { db } from "@/db";
import { walletConnections } from "@/db/schema";
import { decryptSecret } from "@/server/wallet/crypto";
import { walletAccessToken } from "@/server/wallet/connection";
import { ConnectionEndedError } from "@/server/wallet/oauth";
import { APP_URL, CLIENT_ID } from "./fakeAnyApi";
import { fake } from "./fakeServer";
import { comeBack, connectWallet, pressConnect, walletInstance } from "./walletEnv";

let instance: ReturnType<typeof walletInstance>;
beforeEach(async () => {
  instance = walletInstance();
  fake.user = "connecting_account";
  await db().delete(walletConnections);
});

const stored = async (accountId = "connecting_account") => (await db().select().from(walletConnections).where(eq(walletConnections.accountId, accountId)))[0];

const connected = () => connectWallet(instance.anyapi);

test("Connect sends the account to AnyAPI's consent screen with this client, its redirect and an S256 challenge, and coming back connects it", async () => {
  const { location, cookie } = await pressConnect();
  const sent = new URL(location);
  expect(`${sent.origin}${sent.pathname}`).toBe("https://api.getanyapi.com/oauth/authorize");
  expect(Object.fromEntries(sent.searchParams)).toMatchObject({ client_id: CLIENT_ID, redirect_uri: `${APP_URL}/connect/callback`, response_type: "code", scope: "run balance:read", code_challenge_method: "S256" });
  expect(cookie).not.toBe("");
  expect(await accountTier("connecting_account")).toBe("free");

  const res = await comeBack(instance.anyapi.approve(location), cookie);
  expect(res.headers.get("location")).toBe(`${APP_URL}/t/aabbccddeeff`);
  expect(await accountTier("connecting_account")).toBe("wallet");
});

test("a callback whose state is not the one this browser was sent with is refused: nothing is exchanged or stored", async () => {
  const { location, cookie } = await pressConnect();
  const forged = instance.anyapi.approve(location).replace(/state=[^&]+/, "state=forged");
  const res = await comeBack(forged, cookie);
  expect(res.headers.get("location")).toBe(`${APP_URL}/t/aabbccddeeff?wallet=failed`);
  expect(instance.anyapi.calls.token).toBe(0);
  expect(await stored()).toBeUndefined();
});

test("a callback reached by another account than the one that pressed Connect is refused", async () => {
  const { location, cookie } = await pressConnect();
  fake.user = "someone_else";
  await comeBack(instance.anyapi.approve(location), cookie);
  expect(instance.anyapi.calls.token).toBe(0);
  expect(await stored()).toBeUndefined();
  expect(await stored("someone_else")).toBeUndefined();
});

test("the stored tokens are unreadable without APP_ENCRYPTION_KEY", async () => {
  await connected();
  const row = await stored();
  const grant = instance.anyapi.grants[0];
  expect(row?.refreshToken).not.toContain(grant?.refresh);
  expect(row?.accessToken).not.toContain(grant?.access);
  expect(decryptSecret(row?.refreshToken ?? "", instance.key)).toBe(grant?.refresh);
  const otherKey = Buffer.alloc(32, 7).toString("base64");
  expect(() => decryptSecret(row?.refreshToken ?? "", otherKey)).toThrow();
});

test("an expired access token is refreshed once, even when two calls find it expired together, and the rotated refresh token is stored", async () => {
  await connected();
  await db().update(walletConnections).set({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
  const tokens = await Promise.all([walletAccessToken("connecting_account"), walletAccessToken("connecting_account")]);
  const grant = instance.anyapi.grants[0];
  expect(instance.anyapi.calls.refresh).toBe(1);
  expect(tokens).toEqual([grant?.access, grant?.access]);
  expect(decryptSecret((await stored())?.refreshToken ?? "", instance.key)).toBe(grant?.refresh);
});

test("a connection revoked at AnyAPI drops the account to the free tier", async () => {
  await connected();
  const grant = instance.anyapi.grants[0];
  if (grant) grant.revoked = true;
  await db().update(walletConnections).set({ accessTokenExpiresAt: new Date(Date.now() - 1000) });
  await expect(walletAccessToken("connecting_account")).rejects.toBeInstanceOf(ConnectionEndedError);
  expect(await stored()).toBeUndefined();
  expect(await accountTier("connecting_account")).toBe("free");
});

test("Disconnect deletes the tokens here and revokes them at AnyAPI", async () => {
  await connected();
  const grant = instance.anyapi.grants[0];
  expect((await disconnect()).status).toBe(204);
  expect(await stored()).toBeUndefined();
  expect(instance.anyapi.calls.revoke).toEqual([grant?.refresh]);
  expect(grant?.revoked).toBe(true);
  expect(await accountTier("connecting_account")).toBe("free");
});
