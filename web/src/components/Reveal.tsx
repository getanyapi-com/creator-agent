"use client";

import { Mail } from "lucide-react";
import { ConnectWallet } from "@/auth/ConnectWallet";
import { WALLET } from "@/auth/tierCopy";
import { useWallet } from "@/auth/WalletState";
import type { RevealResult } from "@/lib/reveal";

/** What a free account is told instead of an address: connect a wallet, where this instance lets one connect. */
function WalletGate() {
  const { enabled } = useWallet();
  if (!enabled) return <p className="text-small text-fg-muted">{WALLET.revealNeedsWallet}</p>;
  return (
    <p role="status" className="text-small">
      <ConnectWallet className="font-medium text-accent-text underline-offset-2 hover:underline">{WALLET.revealGate}</ConnectWallet>
    </p>
  );
}

/**
 * Reveal for one creator, or what it gave once pressed: a way to connect a wallet on the free tier, the address on the wallet tier.
 * When the server could not check the wallet, the button stays, with the server's message under it, to be pressed again.
 */
export function Reveal({ handle, result, onReveal, full = false }: { handle: string; result: RevealResult | undefined; onReveal: () => void; full?: boolean }) {
  if (result === undefined || result.kind === "retry") {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={onReveal}
          aria-label={`Reveal email of @${handle}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-control border bg-bg px-2.5 py-1 text-small font-medium transition-motion hover:bg-surface-2"
        >
          <Mail size={13} aria-hidden />
          Reveal{full && " email"}
        </button>
        {result !== undefined && (
          <p role="status" className="text-small text-fg-muted">
            {result.message}
          </p>
        )}
      </div>
    );
  }
  if (result.kind === "needs-wallet") return <WalletGate />;
  if (result.kind === "none") {
    return (
      <p role="status" className="text-small text-fg-muted">
        {WALLET.noPublicEmail}
      </p>
    );
  }
  return (
    <p role="status" className="min-w-0 text-small">
      <span className="block truncate font-mono text-mono font-medium">{result.email}</span>
      {full && result.placeholder && <span className="text-fg-muted">Placeholder, real lookups are not connected yet</span>}
    </p>
  );
}
