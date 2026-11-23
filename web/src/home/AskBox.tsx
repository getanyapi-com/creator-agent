"use client";

import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { ConnectWallet } from "@/auth/ConnectWallet";
import { QuestionsLeft } from "@/auth/QuestionsLeft";
import { ASK_NOTE, WALLET } from "@/auth/tierCopy";
import { useWallet } from "@/auth/WalletState";
import { useAsk } from "@/lib/useAsk";

export function AskBox() {
  const [text, setText] = useState("");
  const { ask, pending, error, noneLeft } = useAsk(setText);
  const { enabled, tier } = useWallet();
  return (
    <>
      <form
        className="mt-8 flex items-end gap-2 rounded-card border bg-bg p-2 pl-4 shadow-sm transition-motion focus-within:border-accent"
        onSubmit={(event) => {
          event.preventDefault();
          ask(text);
        }}
      >
        <label htmlFor="ask" className="sr-only">
          Your question
        </label>
        <textarea
          id="ask"
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Small creators whose unboxing videos blew up this month"
          className="min-w-0 flex-1 resize-none bg-transparent py-1.5 outline-none placeholder:text-fg-subtle"
        />
        <button
          type="submit"
          aria-label="Ask"
          disabled={text.trim() === "" || pending}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-accent text-accent-fg transition-motion disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-subtle"
        >
          <ArrowUp size={18} />
        </button>
      </form>
      <p className="mt-3 text-small text-fg-muted">{ASK_NOTE[tier]}</p>
      {tier === "free" && <QuestionsLeft className="mt-2 text-small text-fg-muted" />}
      {error !== null && (
        <p role="status" className="mt-3 rounded-control bg-surface-2 px-3 py-2 text-small">
          {error}
          {noneLeft && enabled && (
            <>
              {" "}
              <ConnectWallet className="font-medium text-accent-text underline-offset-2 hover:underline">{WALLET.noneLeftOffer}</ConnectWallet>.
            </>
          )}
        </p>
      )}
    </>
  );
}
