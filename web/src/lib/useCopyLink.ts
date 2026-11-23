"use client";

import { useEffect, useState } from "react";

/** Copies the current page's address; `copied` stays true briefly so the button can say so. */
export function useCopyLink(): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    const url = `${window.location.origin}${window.location.pathname}`;
    void navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false));
  };
  return { copied, copy };
}
