"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Starts connecting an AnyAPI wallet (`/connect`, which leaves for AnyAPI), coming back to this page with its query, dev bar
 * choices included, less the mark of an earlier failed try.
 */
export function ConnectWallet({ className, children }: { className?: string; children: ReactNode }) {
  const params = new URLSearchParams(useSearchParams());
  params.delete("wallet");
  const query = params.toString();
  const back = `${usePathname()}${query === "" ? "" : `?${query}`}`;
  return (
    <a href={`/connect?back=${encodeURIComponent(back)}`} className={className}>
      {children}
    </a>
  );
}
