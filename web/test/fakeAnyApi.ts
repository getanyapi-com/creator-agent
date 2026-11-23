import { createHash, randomBytes } from "node:crypto";

/**
 * A fake of AnyAPI's OAuth endpoints and its run endpoint, answering the app's fetch in place of the network.
 * It behaves as AnyAPI does: a public client with S256 PKCE; the refresh token rotates on every use and a
 * second use of an old one revokes the grant; every failed exchange answers 400 invalid_grant; a run with an
 * unknown, expired or revoked access token answers 401; a wallet with no money or a grant at its cap answers 402.
 * GET /v1/balance answers `{ usd }` for a token in date and 401 for any other.
 */

export const CLIENT_ID = "client-check";
export const APP_URL = "http://check.invalid";
const REDIRECT = `${APP_URL}/connect/callback`;
/** AnyAPI's access token lifetime. */
const ACCESS_SECONDS = 3600;

interface Grant {
  refresh: string;
  access: string;
  accessExpired: boolean;
  revoked: boolean;
  spentRefresh: Set<string>;
}

const token = (kind: string) => `${kind}-${randomBytes(9).toString("hex")}`;

export function fakeAnyApi() {
  const codes = new Map<string, { challenge: string; redirect: string }>();
  const grants: Grant[] = [];
  const calls = { token: 0, refresh: 0, balance: 0, revoke: [] as string[], runs: [] as { bearer: string | null; status: number }[] };
  /** What GET /v1/balance reports; five dollars is an arbitrary funded wallet, many times one question's budget. */
  let balanceUsd = 5;
  /** What a run answers once its wallet is out of money or its grant at its cap; null while it can pay. */
  let walletRefusal: "insufficient_balance" | "grant_cap_exceeded" | null = null;
  /** Data calls that may run before `walletRefusal` applies. */
  let paidCallsLeft = Number.POSITIVE_INFINITY;

  const issue = (grant: Grant) => ({ access_token: grant.access, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: grant.refresh, scope: "run balance:read" });
  const invalidGrant = () => Response.json({ error: "invalid_grant" }, { status: 400 });

  function tokenEndpoint(form: URLSearchParams): Response {
    calls.token += 1;
    if (form.get("client_id") !== CLIENT_ID) return invalidGrant();
    if (form.get("grant_type") === "authorization_code") {
      const pending = codes.get(form.get("code") ?? "");
      codes.delete(form.get("code") ?? "");
      const verifier = form.get("code_verifier") ?? "";
      if (!pending || pending.redirect !== form.get("redirect_uri") || createHash("sha256").update(verifier).digest("base64url") !== pending.challenge) return invalidGrant();
      const grant: Grant = { refresh: token("refresh"), access: token("access"), accessExpired: false, revoked: false, spentRefresh: new Set() };
      grants.push(grant);
      return Response.json(issue(grant));
    }
    calls.refresh += 1;
    const presented = form.get("refresh_token") ?? "";
    const grant = grants.find((g) => g.refresh === presented || g.spentRefresh.has(presented));
    if (!grant || grant.revoked) return invalidGrant();
    if (grant.refresh !== presented) {
      grant.revoked = true;
      return invalidGrant();
    }
    grant.spentRefresh.add(grant.refresh);
    Object.assign(grant, { refresh: token("refresh"), access: token("access"), accessExpired: false });
    return Response.json(issue(grant));
  }

  const unauthorized = () => Response.json({ code: "unauthorized" }, { status: 401 });

  /** The grant whose access token the request carries, while it is honoured. */
  function bearerGrant(headers: Headers): Grant | undefined {
    const bearer = headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
    return grants.find((g) => g.access === bearer && !g.revoked && !g.accessExpired);
  }

  function balance(headers: Headers): Response {
    calls.balance += 1;
    return bearerGrant(headers) === undefined ? unauthorized() : Response.json({ usd: balanceUsd });
  }

  function answer(headers: Headers): Response {
    if (bearerGrant(headers) === undefined) return unauthorized();
    if (walletRefusal !== null && paidCallsLeft <= 0) return Response.json({ code: walletRefusal }, { status: 402 });
    paidCallsLeft -= 1;
    return Response.json({ costUsd: 0.0006, source: { id: "fake" }, output: { data: null } });
  }

  function run(headers: Headers): Response {
    const response = answer(headers);
    calls.runs.push({ bearer: headers.get("authorization")?.replace(/^Bearer /, "") ?? null, status: response.status });
    return response;
  }

  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const form = new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : String(init?.body ?? ""));
    if (url.pathname === "/oauth/token") return tokenEndpoint(form);
    if (url.pathname === "/oauth/revoke") {
      const presented = form.get("token") ?? "";
      calls.revoke.push(presented);
      for (const g of grants) if (g.refresh === presented || g.access === presented) g.revoked = true;
      return new Response(null, { status: 200 });
    }
    if (url.pathname.startsWith("/v1/run/")) return run(new Headers(init?.headers));
    if (url.pathname === "/v1/balance") return balance(new Headers(init?.headers));
    throw new Error(`The fake AnyAPI does not answer ${url.pathname}`);
  };

  return {
    fetch: fetchFn,
    calls,
    grants,
    /** The consent screen's Approve: takes the authorize URL the app sent the browser to, returns the callback URL AnyAPI would send it back to. */
    approve(authorizeUrl: string): string {
      const query = new URL(authorizeUrl).searchParams;
      const code = token("code");
      codes.set(code, { challenge: query.get("code_challenge") ?? "", redirect: query.get("redirect_uri") ?? "" });
      return `${REDIRECT}?code=${code}&state=${encodeURIComponent(query.get("state") ?? "")}`;
    },
    /** Sets what GET /v1/balance reports from now on. */
    setBalance(usd: number) {
      balanceUsd = usd;
    },
    /** After `afterCalls` more paid data calls, every run is refused with this code. */
    refuseWallet(code: "insufficient_balance" | "grant_cap_exceeded", afterCalls = 0) {
      walletRefusal = code;
      paidCallsLeft = afterCalls;
    },
  };
}
