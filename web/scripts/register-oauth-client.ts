/**
 * One-off operator command (lurk's `scripts/register-oauth-client.ts`). Registers this instance as an AnyAPI
 * OAuth client and prints the client id to put in ANYAPI_OAUTH_CLIENT_ID. Never run at boot.
 *
 * The redirect is `<APP_URL>/connect/callback`. AnyAPI accepts https, or plain http only on localhost or a
 * loopback address, whose port it ignores. More origins the same
 * instance is reached at may follow as arguments, since a client's redirects cannot be changed later.
 */
import { ANYAPI_BASE_URL } from "../../src/endpoints.ts";
import { PRODUCT_NAME } from "../src/lib/brand.ts";
import { OAUTH_SCOPE } from "../src/server/wallet/scope.ts";

const trim = (origin: string) => origin.replace(/\/+$/, "");
const appUrl = trim(process.env.APP_URL || "http://localhost:3000");
const origins = [appUrl, ...process.argv.slice(2).map(trim)];
const https = appUrl.startsWith("https://");

const body: Record<string, unknown> = {
  // A plain-http instance is someone's development copy; its name says so on AnyAPI's consent screen.
  client_name: https ? PRODUCT_NAME : `${PRODUCT_NAME} (dev)`,
  redirect_uris: origins.map((origin) => `${origin}/connect/callback`),
  token_endpoint_auth_method: "none",
  scope: OAUTH_SCOPE,
};
if (https) {
  body.client_uri = appUrl;
}

const response = await fetch(`${ANYAPI_BASE_URL}/oauth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
if (!response.ok) {
  throw new Error(`Registration failed with status ${response.status}: ${await response.text()}`);
}
const registered = (await response.json()) as { client_id: string; redirect_uris: string[] };
console.log(`Redirects: ${registered.redirect_uris.join(" ")}`);
console.log(`ANYAPI_OAUTH_CLIENT_ID=${registered.client_id}`);
