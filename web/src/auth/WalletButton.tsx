"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ConnectWallet } from "./ConnectWallet";
import { WALLET } from "./tierCopy";
import { useWallet } from "./WalletState";

const CONTROL = "rounded-control px-3 py-1.5 text-small font-medium whitespace-nowrap transition-motion hover:bg-surface-2";

/** The header's wallet control for a signed-in account, beside its account button: connect, or connected with Disconnect. */
export function WalletButton() {
  const { isSignedIn } = useAuth();
  const { enabled, tier } = useWallet();
  const router = useRouter();
  // The callback comes back with ?wallet=failed when the connection did not go through.
  const failed = useSearchParams().get("wallet") === "failed";
  const [busy, setBusy] = useState(false);
  if (!enabled || isSignedIn !== true) return null;
  if (tier === "free") {
    return (
      <ConnectWallet className={`${CONTROL} border`}>
        {failed ? (
          WALLET.failed
        ) : (
          <>
            <span className="sm:hidden">{WALLET.connectShort}</span>
            <span className="hidden sm:inline">{WALLET.connect}</span>
          </>
        )}
      </ConnectWallet>
    );
  }
  const disconnect = () => {
    setBusy(true);
    fetch("/connect/disconnect", { method: "POST" })
      .then(() => router.refresh())
      .finally(() => setBusy(false));
  };
  return (
    <span className="flex items-center gap-1 text-small">
      <span className="hidden px-1 whitespace-nowrap text-fg-muted sm:inline">{WALLET.connected}</span>
      <button type="button" onClick={disconnect} disabled={busy} className={`${CONTROL} text-fg-muted hover:text-fg`}>
        <span className="sm:hidden">{WALLET.disconnectShort}</span>
        <span className="hidden sm:inline">{WALLET.disconnect}</span>
      </button>
    </span>
  );
}
