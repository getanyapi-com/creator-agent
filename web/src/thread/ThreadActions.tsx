"use client";

import { Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useCopyLink } from "@/lib/useCopyLink";

const ACTION = "inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-small font-medium transition-motion";

/** Copy link for everyone; Remove, with a confirmation, only for the asker. */
export function ThreadActions({ isAsker, onRemove }: { isAsker: boolean; onRemove: () => void }) {
  const { copied, copy } = useCopyLink();
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-small">
        <span className="text-fg-muted">Remove this thread from public view?</span>
        <button type="button" onClick={onRemove} className={`${ACTION} bg-danger text-danger-fg`}>
          Remove
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={`${ACTION} text-fg-muted hover:bg-surface-2`}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div className="-ml-2.5 flex items-center gap-1">
      <button type="button" onClick={copy} className={`${ACTION} text-fg-muted hover:bg-surface-2 hover:text-fg`}>
        <Link2 size={14} aria-hidden />
        {copied ? "Link copied" : "Copy link"}
      </button>
      {isAsker && (
        <button type="button" onClick={() => setConfirming(true)} className={`${ACTION} text-fg-muted hover:bg-surface-2 hover:text-fg`}>
          <Trash2 size={14} aria-hidden />
          Remove
        </button>
      )}
    </div>
  );
}
