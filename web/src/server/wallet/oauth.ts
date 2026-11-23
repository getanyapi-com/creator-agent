import { createHash, randomBytes } from "node:crypto";
import { CALL_TIMEOUT_MS } from "../../../../src/anyapi.ts";
import { ANYAPI_BASE_URL } from "../../../../src/endpoints.ts";
import { config } from "@/server/config";
import { within } from "@/server/within";
import { OAUTH_SCOPE } from "./scope.ts";

/**
 * AnyAPI's OAuth endpoints, as lurk calls them (`src/lib/oauth.ts`): a public client with PKCE, no client
 * secret. AnyAPI rotates the refresh token on every use and answers `invalid_grant` for one it no longer
 * honours, which is how a connection the user ended at AnyAPI shows up here.
 */

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/** AnyAPI no longer honours this connection: revoked, expired, or its refresh token already spent. */
export class ConnectionEndedError extends Error {
  constructor() {
    super("AnyAPI ended this wallet connection");
    this.name = "ConnectionEndedError";
  }
}

/** AnyAPI could not be asked just now (network error, timeout, a 5xx): the connection may still be good. */
export class OAuthUnavailableError extends Error {
  constructor(cause: unknown) {
    super("AnyAPI's OAuth server could not be reached", { cause });
    this.name = "OAuthUnavailableError";
  }
}

/** A PKCE verifier and its S256 challenge; 64 random bytes is the longest verifier RFC 7636 allows once encoded (86 of 128 characters). */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(64).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** lurk's state: 24 random bytes. */
export function randomState(): string {
  return randomBytes(24).toString("base64url");
}

export function redirectUri(): string {
  return `${config().APP_URL}/connect/callback`;
}

function clientId(): string {
  const id = config().ANYAPI_OAUTH_CLIENT_ID;
  if (id === undefined) throw new Error("ANYAPI_OAUTH_CLIENT_ID is not set; run pnpm --filter web anyapi:register");
  return id;
}

export function authorizeUrl(state: string, challenge: string): string {
  const query = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: OAUTH_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${ANYAPI_BASE_URL}/oauth/authorize?${query.toString()}`;
}

/**
 * Every OAuth request, and the wallet check (`balance.ts`), response body included, ends within the core's deadline for one AnyAPI data call
 * (`CALL_TIMEOUT_MS`, src/anyapi.ts) or when `caller` aborts, whichever comes first.
 */
export function deadline(caller?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
  return caller === undefined ? timeout : AbortSignal.any([caller, timeout]);
}

async function readToken(form: URLSearchParams, signal: AbortSignal): Promise<TokenResponse> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`${ANYAPI_BASE_URL}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form, signal });
    // A 2xx body that does not arrive whole is a failed request; an error body is read for its code only.
    body = response.ok ? await response.json() : await response.json().catch(() => null);
  } catch (err) {
    throw new OAuthUnavailableError(err);
  }
  if (response.ok) return body as TokenResponse;
  if (response.status === 400 && (body as { error?: unknown } | null)?.error === "invalid_grant") throw new ConnectionEndedError();
  if (response.status >= 500) throw new OAuthUnavailableError(response.status);
  throw new Error(`AnyAPI token request failed with status ${response.status}`);
}

function postToken(form: URLSearchParams, caller?: AbortSignal): Promise<TokenResponse> {
  const signal = deadline(caller);
  return within(signal, readToken(form, signal)).catch((err: unknown) => {
    throw err === signal.reason ? new OAuthUnavailableError(err) : err;
  });
}

export function exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
  return postToken(new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId(), redirect_uri: redirectUri(), code_verifier: verifier }));
}

/** `signal` is the calling data request's, so a request given up on stops waiting for its refresh. */
export function refreshTokens(refreshToken: string, signal?: AbortSignal): Promise<TokenResponse> {
  return postToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId() }), signal);
}

/**
 * Best effort, within the same deadline: a failed or timed-out revoke must not block disconnecting here.
 * Says whether AnyAPI confirmed it.
 */
export function revokeToken(token: string): Promise<boolean> {
  const signal = deadline();
  const request = fetch(`${ANYAPI_BASE_URL}/oauth/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal,
  });
  return within(signal, request).then(
    (response) => response.ok,
    () => false,
  );
}
