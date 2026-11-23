import { signInRequired, viewerId } from "@/auth/session";
import { disconnectWallet } from "@/server/wallet/connection";

/** Disconnect: deletes the account's tokens here and revokes them at AnyAPI (lurk's `disconnectWalletAction`). */
export async function POST() {
  const accountId = await viewerId();
  if (accountId === null) return signInRequired();
  await disconnectWallet(accountId);
  return new Response(null, { status: 204 });
}
