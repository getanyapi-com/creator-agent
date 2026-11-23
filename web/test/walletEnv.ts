import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { vi } from "vitest";
import { GET as callback } from "@/app/connect/callback/route";
import { GET as connect } from "@/app/connect/route";
import { CONNECT_COOKIE } from "@/server/wallet/connectFlow";
import { APP_URL, CLIENT_ID, fakeAnyApi } from "./fakeAnyApi";

/** The settings a wallet check runs with, and a fresh fake AnyAPI answering the app's fetch. */
export function walletInstance(): { anyapi: ReturnType<typeof fakeAnyApi>; key: string } {
  const key = randomBytes(32).toString("base64");
  vi.stubEnv("APP_URL", APP_URL);
  vi.stubEnv("ANYAPI_OAUTH_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("APP_ENCRYPTION_KEY", key);
  const anyapi = fakeAnyApi();
  globalThis.fetch = anyapi.fetch;
  return { anyapi, key };
}

/** Presses Connect as the signed-in account: the redirect to AnyAPI and the cookie the browser keeps. */
export async function pressConnect(back = "/t/aabbccddeeff"): Promise<{ location: string; cookie: string }> {
  const res = await connect(new NextRequest(`${APP_URL}/connect?back=${encodeURIComponent(back)}`));
  return { location: res.headers.get("location") ?? "", cookie: res.cookies.get(CONNECT_COOKIE)?.value ?? "" };
}

/** AnyAPI sending the browser back to the callback, with the cookie Connect set. */
export function comeBack(url: string, cookie: string): Promise<Response> {
  return callback(new NextRequest(url, { headers: { cookie: `${CONNECT_COOKIE}=${encodeURIComponent(cookie)}` } }));
}

/** The whole flow, approved on the consent screen, for the signed-in account. */
export async function connectWallet(anyapi: ReturnType<typeof fakeAnyApi>): Promise<void> {
  const { location, cookie } = await pressConnect();
  await comeBack(anyapi.approve(location), cookie);
}
