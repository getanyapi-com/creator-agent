import { signInRequired, viewerId } from "@/auth/session";
import { accountTier, WALLET_UNREACHABLE } from "@/auth/tier";
import type { RevealResult } from "@/data/live";
import { getThread } from "@/data/fixtures";
import { placeholderEmail } from "@/lib/placeholderEmail";
import { bioEmail } from "@/server/liveRun";

/**
 * Reveal, asked at the moment of the click, by a signed-in account only. The free tier reveals nothing, and the server decides
 * the tier (`accountTier`): an account is on the wallet tier while AnyAPI confirms its wallet connection, and the body's `tier` counts
 * only in a development build. On the wallet tier a live question gives the email the core found in the creator's public bio,
 * if any, at no charge; recorded answers carry no contacts, so a creator whose bio had an email gives a made-up example.com address.
 */
export async function POST(request: Request) {
  const userId = await viewerId();
  if (userId === null) return signInRequired();
  const body = (await request.json().catch(() => null)) as { threadId?: unknown; handle?: unknown; tier?: unknown } | null;
  const { threadId, handle, tier } = body ?? {};
  if (typeof threadId !== "string" || typeof handle !== "string") return Response.json({ error: "Bad request." }, { status: 400 });
  const send = (result: RevealResult) => Response.json(result, { headers: { "Cache-Control": "no-store" } });
  const granted = await accountTier(userId, tier);
  if (granted === "unreachable") return Response.json({ error: WALLET_UNREACHABLE }, { status: 503 });
  // Reveal costs nothing, so a wallet too low for a question still reveals.
  if (granted !== "wallet" && granted !== "unfunded") return send({ kind: "needs-wallet" });
  const recorded = getThread(threadId);
  if (recorded !== null) {
    const hasEmail = recorded.creators.some((c) => c.handle === handle && c.hasPublicEmail);
    return send(hasEmail ? { kind: "revealed", email: placeholderEmail(handle), placeholder: true } : { kind: "none" });
  }
  const email = await bioEmail(threadId, handle, userId);
  if (email === undefined) return Response.json({ error: "No such question." }, { status: 404 });
  return send(email === null ? { kind: "none" } : { kind: "revealed", email, placeholder: false });
}
