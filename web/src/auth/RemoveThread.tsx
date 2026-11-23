"use client";

import { X } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useSendToSignIn } from "./useSendToSignIn";

type Remove = (onRemoved: () => void) => void;

const RemoveContext = createContext<Remove>(() => undefined);

/** Remove for the thread on this page, asked of the server, which accepts it only from the account that asked. */
export function useRemoveThread(): Remove {
  return useContext(RemoveContext);
}

/** Provides Remove for one thread and says so plainly when the server refuses it. */
export function RemoveThreadProvider({ threadId, children }: { threadId: string; children: ReactNode }) {
  const sendToSignIn = useSendToSignIn();
  const [refusal, setRefusal] = useState<string | null>(null);
  const remove: Remove = (onRemoved) => {
    fetch(`/api/runs/${threadId}`, { method: "DELETE" })
      .then(async (res) => {
        if (res.ok) return onRemoved();
        if (res.status === 401) return sendToSignIn();
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setRefusal(body.error ?? "This thread could not be removed.");
      })
      .catch(() => setRefusal("This thread could not be removed."));
  };
  return (
    <RemoveContext value={remove}>
      {children}
      {refusal !== null && (
        <div role="alert" className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-start gap-3 rounded-card border bg-surface p-3 text-small shadow-sm">
          <p className="flex-1">{refusal}</p>
          <button type="button" aria-label="Close" onClick={() => setRefusal(null)} className="text-fg-muted hover:text-fg">
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
    </RemoveContext>
  );
}
