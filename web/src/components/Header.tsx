"use client";

import Link from "next/link";
import { AccountButton } from "@/auth/AccountButton";
import { WalletButton } from "@/auth/WalletButton";
import { useHref } from "@/dev/useHref";
import { PRODUCT_NAME } from "@/lib/brand";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header({ showNewQuestion = false }: { showNewQuestion?: boolean }) {
  const href = useHref();
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href={href("/")} className="font-semibold whitespace-nowrap">
          {PRODUCT_NAME}
        </Link>
        <div className="flex items-center gap-1">
          {/* On a phone the name already leads home, and the wallet control needs the room. */}
          {showNewQuestion && (
            <Link
              href={href("/")}
              className="hidden rounded-control px-3 py-1.5 text-small font-medium whitespace-nowrap text-fg-muted transition-motion hover:bg-surface-2 hover:text-fg sm:inline-block"
            >
              New question
            </Link>
          )}
          <ThemeToggle />
          <WalletButton />
          <AccountButton />
        </div>
      </div>
    </header>
  );
}
