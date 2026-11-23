import { ConnectWallet } from "@/auth/ConnectWallet";
import { WALLET, WALLET_STOP } from "@/auth/tierCopy";
import type { WalletStop } from "@/server/wallet/walletFetch";

/** Why a wallet question's research stopped early and what to do, above what it found by then. */
export function WalletStopNote({ stop }: { stop: WalletStop }) {
  return (
    <p role="status" className="mt-6 max-w-3xl rounded-card border bg-surface p-4 text-small">
      {WALLET_STOP[stop]}
      {stop === "disconnected" && (
        <>
          {" "}
          <ConnectWallet className="font-medium text-accent-text underline-offset-2 hover:underline">{WALLET.connect}</ConnectWallet>
        </>
      )}
    </p>
  );
}
