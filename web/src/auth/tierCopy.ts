import type { Tier } from "@/data/types";
import { formatUsd } from "@/lib/format";
import { FREE_LIMIT_USD } from "@/lib/limits";
import type { WalletStop } from "@/server/wallet/walletFetch";

/** Every sentence about the two tiers and the wallet a user reads, in one place so they can be changed here. */

/** Under the front page's headline: "Free." only where the house pays. */
export const LEAD: Record<Tier, string> = {
  free: "Free. Ask in plain words; every creator comes back with the video and the evidence.",
  wallet: "Ask in plain words; every creator comes back with the video and the evidence.",
};

/** Under the ask box: which tier a question will run on and who pays. */
export const ASK_NOTE: Record<Tier, string> = {
  free: `Free: 2 a day, we pay, up to ${formatUsd(FREE_LIMIT_USD)} of research each. Free questions and their answers are public.`,
  wallet: `Your AnyAPI wallet pays for data, up to ${formatUsd(FREE_LIMIT_USD)} a question. Your questions are private.`,
};

/** When a house ceiling refuses a question. */
export const HOUSE_CAP: Record<Tier, string> = {
  free: "Today's free research budget is used up. Free questions open again at midnight UTC.",
  wallet: "Today's research budget for this site is used up. Questions open again at midnight UTC.",
};

export const WALLET = {
  connect: "Connect AnyAPI wallet",
  /** The header's shorter words on a phone, where the longer ones do not fit beside the account button. */
  connectShort: "Connect wallet",
  connected: "Wallet connected",
  disconnect: "Disconnect",
  disconnectShort: "Disconnect wallet",
  failed: "Not connected. Try again",
  /** Offered where a free account is stopped. */
  revealGate: "Connect a wallet to see contact details",
  noneLeftOffer: "Connect an AnyAPI wallet for no daily limit",
  /** The same stops on an instance where no wallet can connect. */
  revealNeedsWallet: "Contact details need a connected wallet.",
  noPublicEmail: "No public email found.",
} as const;

/** On a wallet question whose data calls stopped part-way: which stop it was, and what to do. */
export const WALLET_STOP: Record<WalletStop, string> = {
  empty: "Your AnyAPI wallet ran out of money, so the research stopped early with what it had found. Top up on AnyAPI and ask again.",
  capped: "This app reached the spend limit you set for it on AnyAPI, so the research stopped early with what it had found. Raise the limit on AnyAPI and ask again.",
  disconnected: "Your AnyAPI wallet was disconnected, so the research stopped early with what it had found. Connect it again to ask more.",
};
