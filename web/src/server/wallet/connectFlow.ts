import { config } from "@/server/config";

/**
 * What the connect flow keeps between sending the account to AnyAPI and its coming back, in an httpOnly cookie
 * on /connect as lurk does (`src/app/connect/route.ts`): the PKCE verifier, the state AnyAPI must echo, the
 * account that started it, and the page to return to.
 */
export interface PendingConnect {
  verifier: string;
  state: string;
  accountId: string;
  back: string;
}

export const CONNECT_COOKIE = "anyapi_oauth";

/** lurk's lifetime for the pending flow: ten minutes, as long as AnyAPI keeps the consent request open. */
const CONNECT_COOKIE_SECONDS = 600;

/**
 * A path on this site to come back to: the candidate, resolved against this instance's public origin, is kept
 * only when it stays on that origin and has no control character (which URL parsing would drop, turning
 * `/\t/host` into `//host`). A path that starts `//` or `/\` is dropped too: resolved again where it is used,
 * it names another host. Anything else comes back to the front page.
 */
export function safeBack(back: string | null): string {
  if (back === null || hasControl(back)) return "/";
  const origin = new URL(config().APP_URL).origin;
  const url = URL.parse(back, origin);
  const path = url?.origin === origin ? `${url.pathname}${url.search}${url.hash}` : "/";
  return /^\/[/\\]/.test(path) ? "/" : path;
}

/** A C0 control (U+0000 to U+001F) or DEL (U+007F), which the WHATWG URL parser strips or treats as a separator. */
function hasControl(text: string): boolean {
  return [...text].some((c) => c.charCodeAt(0) <= 0x1f || c.charCodeAt(0) === 0x7f);
}

export function cookieOptions(maxAge = CONNECT_COOKIE_SECONDS) {
  return { httpOnly: true, sameSite: "lax" as const, secure: config().APP_URL.startsWith("https://"), path: "/connect", maxAge };
}

export function readPending(value: string | undefined): PendingConnect | null {
  if (value === undefined) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingConnect>;
    const { verifier, state, accountId, back } = parsed;
    return typeof verifier === "string" && typeof state === "string" && typeof accountId === "string" && typeof back === "string" ? { verifier, state, accountId, back: safeBack(back) } : null;
  } catch {
    return null;
  }
}

/** Where the flow ends: the page it started from, on this instance's public origin, marked when it failed. */
export function returnUrl(back: string, failed: boolean): string {
  const url = new URL(safeBack(back), config().APP_URL);
  if (failed) url.searchParams.set("wallet", "failed");
  return url.toString();
}
