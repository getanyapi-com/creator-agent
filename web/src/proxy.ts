import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

// Attaches the Clerk session to every request, as lurk does. Nothing is refused here: reading stays open,
// and each route that needs an account checks the session itself (src/auth/session.ts).
const withClerk = clerkMiddleware();

/**
 * The dev build may be opened over plain http at an address other than localhost. Clerk's handshake marks its
 * cookies Secure and SameSite=None, which a browser drops over http anywhere but localhost, so the
 * handshake loops three times and the page renders as signed out. Over http in a dev build only, those
 * two attributes are taken off; an https deployment never reaches this.
 */
function plainHttpCookies(response: Response): Response {
  const cookies = response.headers.getSetCookie();
  if (cookies.length === 0) return response;
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const cookie of cookies) headers.append("set-cookie", cookie.replace(/;\s*Secure/gi, "").replace(/SameSite=None/gi, "SameSite=Lax"));
  return new NextResponse(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = await withClerk(request, event);
  if (process.env.NODE_ENV === "production" || request.nextUrl.protocol !== "http:" || !response) return response;
  return plainHttpCookies(response);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
