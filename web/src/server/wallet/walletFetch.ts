import type { FetchFn } from "../../../../src/anyapi.ts";
import { ConnectionEndedError } from "./oauth";
import { walletAccessToken } from "./connection";

/** Why a wallet run's data calls stopped part-way: no money left, the spend cap the user set for this app, or no connection. */
export type WalletStop = "empty" | "capped" | "disconnected";

/** AnyAPI's 402 codes for a wallet that may not pay. */
const STOP_CODES: Record<string, WalletStop> = { insufficient_balance: "empty", grant_cap_exceeded: "capped" };

/** What every data call answers once the wallet has stopped: a 402, which the core reads as a refusal before anything ran, so nothing is charged. */
function stoppedResponse(stop: WalletStop): Response {
  return Response.json({ code: `wallet_${stop}` }, { status: 402 });
}

function withToken(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

async function stopCode(response: Response): Promise<WalletStop | null> {
  if (response.status !== 402) return null;
  const body = (await response.clone().json().catch(() => null)) as { code?: unknown; error?: { code?: unknown } } | null;
  const code = body?.code ?? body?.error?.code;
  return typeof code === "string" ? (STOP_CODES[code] ?? null) : null;
}

/**
 * The fetch a wallet run's data client calls AnyAPI with. Every call carries the account's current access
 * token, read at the moment of the call, so a token that expires during a 2 to 13 minute run is refreshed
 * before it is used; a call AnyAPI refuses with 401 is tried once more on a fresh token. Once the wallet is
 * empty, capped or disconnected, every later call is answered here without reaching AnyAPI, the research
 * finishes on what it found, and `stop` says which it was.
 */
export function walletFetch(accountId: string): { fetchFn: FetchFn; stop: () => WalletStop | null } {
  let stopped: WalletStop | null = null;
  const token = async (rejected: string | null, signal: AbortSignal | undefined): Promise<string | null> => {
    try {
      return await walletAccessToken(accountId, rejected, signal);
    } catch (err) {
      if (err instanceof ConnectionEndedError) return null;
      throw err;
    }
  };
  const fetchFn: FetchFn = async (input, init) => {
    if (stopped !== null) return stoppedResponse(stopped);
    const signal = init?.signal ?? undefined;
    let current = await token(null, signal);
    if (current === null) return stoppedResponse((stopped = "disconnected"));
    let response = await fetch(input, withToken(init, current));
    if (response.status === 401) {
      current = await token(current, signal);
      if (current === null) return stoppedResponse((stopped = "disconnected"));
      response = await fetch(input, withToken(init, current));
      if (response.status === 401) stopped = "disconnected";
    }
    stopped ??= await stopCode(response);
    return response;
  };
  return { fetchFn, stop: () => stopped };
}
