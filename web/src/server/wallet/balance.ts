import { ANYAPI_BASE_URL } from "../../../../src/endpoints.ts";
import { within } from "@/server/within";
import { deadline, OAuthUnavailableError } from "./oauth";

/**
 * Asks AnyAPI, with the account's access token, what its wallet holds: the one authenticated request that
 * costs nothing (`GET /v1/balance`, which the grant's `balance:read` scope opens). It answers `{ usd }`, the
 * wallet's balance only: a grant's own spend cap and what is left of it are not reported anywhere a grant can read.
 * `invalid` when AnyAPI no longer honours the token (401: unknown, expired, revoked, or its account not active).
 * A grant AnyAPI paused for an empty wallet answers 402 `insufficient_balance` to every request, so it reads as
 * nothing to spend. Throws OAuthUnavailableError when AnyAPI could not be asked: a network error, a 5xx, or the
 * OAuth deadline passing.
 */
export function walletBalanceUsd(accessToken: string): Promise<number | "invalid"> {
  const signal = deadline();
  return within(signal, readBalance(accessToken, signal)).catch((err: unknown) => {
    throw err === signal.reason ? new OAuthUnavailableError(err) : err;
  });
}

async function readBalance(accessToken: string, signal: AbortSignal): Promise<number | "invalid"> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`${ANYAPI_BASE_URL}/v1/balance`, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
    body = response.ok ? await response.json() : null;
  } catch (err) {
    throw new OAuthUnavailableError(err);
  }
  if (response.status === 401) return "invalid";
  if (response.status === 402) return 0;
  if (response.status >= 500) throw new OAuthUnavailableError(response.status);
  const usd = (body as { usd?: unknown } | null)?.usd;
  if (response.ok && typeof usd === "number") return usd;
  throw new Error(`AnyAPI balance request failed with status ${response.status}`);
}
