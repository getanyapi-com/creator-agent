import { NextResponse, type NextRequest } from "next/server";
import { viewerId } from "@/auth/session";
import { saveWalletTokens } from "@/server/wallet/connection";
import { CONNECT_COOKIE, cookieOptions, readPending, returnUrl } from "@/server/wallet/connectFlow";
import { exchangeCode } from "@/server/wallet/oauth";

/**
 * Finishes connecting (lurk's `src/app/connect/callback/route.ts`): the state must be the one this browser was
 * sent with and the account the one that started, then the code is exchanged and both tokens stored encrypted.
 * Anything else, a refusal on the consent screen included, comes back marked failed and stores nothing.
 */
export async function GET(request: NextRequest) {
  const pending = readPending(request.cookies.get(CONNECT_COOKIE)?.value);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const finish = (failed: boolean) => {
    const response = NextResponse.redirect(returnUrl(pending?.back ?? "/", failed));
    response.cookies.set(CONNECT_COOKIE, "", cookieOptions(0));
    return response;
  };
  if (pending === null || code === null || state !== pending.state || (await viewerId()) !== pending.accountId) return finish(true);
  try {
    await saveWalletTokens(pending.accountId, await exchangeCode(code, pending.verifier));
  } catch {
    // Nothing about the failure is logged: the exchange carries the code and verifier.
    return finish(true);
  }
  return finish(false);
}
