import { auth } from "@clerk/nextjs/server";

/** The signed-in account's Clerk user id, or null for a visitor. Pages and routes call this; the proxy only attaches the session. */
export async function viewerId(): Promise<string | null> {
  return (await auth()).userId;
}

/** The response every route that needs an account gives a visitor. */
export function signInRequired(): Response {
  return Response.json({ error: "Sign in first." }, { status: 401 });
}
