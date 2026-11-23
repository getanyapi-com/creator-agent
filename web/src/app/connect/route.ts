import { NextResponse, type NextRequest } from "next/server";
import { viewerId } from "@/auth/session";
import { config } from "@/server/config";
import { CONNECT_COOKIE, cookieOptions, safeBack, type PendingConnect } from "@/server/wallet/connectFlow";
import { authorizeUrl, createPkcePair, randomState } from "@/server/wallet/oauth";

/** Starts connecting an AnyAPI wallet (lurk's `src/app/connect/route.ts`): mint PKCE, keep it, send the account to AnyAPI's consent screen. */
export async function GET(request: NextRequest) {
  const back = safeBack(request.nextUrl.searchParams.get("back"));
  if (config().ANYAPI_OAUTH_CLIENT_ID === undefined) return NextResponse.redirect(new URL(back, config().APP_URL));
  const accountId = await viewerId();
  if (accountId === null) {
    const again = `/connect?back=${encodeURIComponent(back)}`;
    return NextResponse.redirect(new URL(`/sign-in?redirect_url=${encodeURIComponent(again)}`, config().APP_URL));
  }
  const { verifier, challenge } = createPkcePair();
  const state = randomState();
  const pending: PendingConnect = { verifier, state, accountId, back };
  const response = NextResponse.redirect(authorizeUrl(state, challenge));
  response.cookies.set(CONNECT_COOKIE, JSON.stringify(pending), cookieOptions());
  return response;
}
