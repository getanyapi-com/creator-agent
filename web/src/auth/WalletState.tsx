"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Tier } from "@/data/types";
import { useViewState } from "@/dev/useViewState";
import type { WalletView } from "./tier";

const WalletContext = createContext<WalletView>({ enabled: false, connected: false });

/** Hands the page's client components the server's word on wallets for this request (`walletState`). */
export function WalletProvider({ state, children }: { state: WalletView; children: ReactNode }) {
  return <WalletContext value={state}>{children}</WalletContext>;
}

/** The server's word on wallets, and the tier to show: the account's own, or the dev bar's choice in a dev build. */
export function useWallet(): WalletView & { tier: Tier } {
  const wallet = useContext(WalletContext);
  const [view] = useViewState();
  return { ...wallet, tier: view.tier ?? (wallet.connected ? "wallet" : "free") };
}
