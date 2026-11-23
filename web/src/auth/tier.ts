import { FREE_BUDGET_USD } from "../../../src/index.ts";
import type { Tier } from "@/data/types";
import { formatUsd } from "@/lib/format";
import { config } from "@/server/config";
import { walletConnected, walletStanding } from "@/server/wallet/connection";

/** What the pages tell the browser about wallets: whether one can connect on this instance, and whether this account's is. */
export interface WalletView {
  enabled: boolean;
  connected: boolean;
}

/**
 * A wallet can connect only on an instance with an AnyAPI OAuth client; without one every account is free.
 * Read from the connection row with no call to AnyAPI, so it is for showing the tier; nothing is granted from it.
 */
export async function walletState(accountId: string | null): Promise<WalletView> {
  const enabled = config().ANYAPI_OAUTH_CLIENT_ID !== undefined;
  return { enabled, connected: enabled && accountId !== null && (await walletConnected(accountId)) };
}

/** What a request that would be granted the wallet tier answers when AnyAPI cannot be asked about the wallet. */
export const WALLET_UNREACHABLE = "We could not check your wallet with AnyAPI. Try again in a moment.";

/** What a question asked on a wallet connection AnyAPI has just ended answers; it is not run, and the account is free after it. */
export const WALLET_ENDED = "Your AnyAPI wallet is no longer connected. Connect it again, or ask as a free question; free questions are public.";

/** What a question answers when the connected wallet holds less than one question's budget; it is not run, and the wallet stays connected. */
export const WALLET_UNFUNDED = `Your AnyAPI wallet needs at least ${formatUsd(FREE_BUDGET_USD)} to ask a question. Add funds at getanyapi.com/dashboard.`;

/**
 * The tier the server grants a signed-in account, whatever the browser sends: wallet while AnyAPI confirms its
 * wallet connection right now (`walletStanding`, one request to AnyAPI), free when it has none. `unfunded` when
 * the grant is good but the wallet holds less than one question's budget (`FREE_BUDGET_USD`, data and model
 * together): enough for Reveal, which costs nothing, not for a question. `ended` when AnyAPI has just ended the
 * connection, which is deleted, so this request was asked as wallet and the next is free; `unreachable` when
 * AnyAPI could not be asked. Neither grants anything for this request. Only a development build honours
 * `requested`, the dev bar's Tier switch, so the owner can look at both states.
 */
export async function accountTier(accountId: string, requested?: unknown): Promise<Tier | "unfunded" | "ended" | "unreachable"> {
  if (process.env.NODE_ENV === "development" && (requested === "free" || requested === "wallet")) return requested;
  if (config().ANYAPI_OAUTH_CLIENT_ID === undefined) return "free";
  const standing = await walletStanding(accountId);
  if (typeof standing !== "object") return standing === "none" ? "free" : standing;
  return standing.balanceUsd < FREE_BUDGET_USD ? "unfunded" : "wallet";
}
