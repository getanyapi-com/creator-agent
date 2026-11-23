import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GET as connect } from "@/app/connect/route";
import { db } from "@/db";
import { APP_URL } from "./fakeAnyApi";
import { fake } from "./fakeServer";
import { comeBack, pressConnect, walletInstance } from "./walletEnv";

// The reviewer's OPEN_REDIRECT and REDIRECT_DISABLED_OAUTH probes, as checks, with the other shapes that leave a site.

let instance: ReturnType<typeof walletInstance>;
beforeEach(async () => {
  instance = walletInstance();
  fake.user = "owner";
  await db().execute(sql`truncate wallet_connections`);
});
afterEach(() => vi.unstubAllEnvs());

test.each([
  ["a tab the URL parser drops", "/\t/attacker.invalid/landing", "/"],
  ["a backslash", "/\\attacker.invalid/landing", "/"],
  ["a protocol-relative host", "//attacker.invalid/landing", "/"],
  ["an absolute URL", "http://attacker.invalid/landing", "/"],
  ["this site's origin and a path that starts with two slashes", `${APP_URL}//attacker.invalid/landing`, "/"],
  ["this site's origin and a path that starts with a slash and a backslash", `${APP_URL}/\\attacker.invalid/landing`, "/"],
  ["a path on this site with a query", "/t/aabbccddeeff?from=feed", "/t/aabbccddeeff?from=feed"],
])("back with %s comes back to the expected path, with and without an OAuth client", async (_name, back, expected) => {
  const { location, cookie } = await pressConnect(back);
  const res = await comeBack(instance.anyapi.approve(location), cookie);
  expect(res.headers.get("location")).toBe(`${APP_URL}${expected}`);

  vi.stubEnv("ANYAPI_OAUTH_CLIENT_ID", "");
  const disabled = await connect(new NextRequest(`${APP_URL}/connect?back=${encodeURIComponent(back)}`));
  expect(disabled.headers.get("location")).toBe(`${APP_URL}${expected}`);
});
