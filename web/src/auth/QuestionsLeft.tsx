"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useContext, type ReactNode } from "react";
import type { Allowance } from "./allowance";

const AllowanceContext = createContext<Allowance | null>(null);

/** Hands the front page's ask box what the signed-in account has left today, read by the server for this request. */
export function AllowanceProvider({ allowance, children }: { allowance: Allowance | null; children: ReactNode }) {
  return <AllowanceContext value={allowance}>{children}</AllowanceContext>;
}

/** How many of today's questions a signed-in account has left. Nothing for a visitor. Asking with none left says when the next opens. */
export function QuestionsLeft({ className }: { className?: string }) {
  const allowance = useContext(AllowanceContext);
  const { isSignedIn } = useAuth();
  if (allowance === null || isSignedIn === false) return null;
  return <p className={className}>{`${allowance.left} of ${allowance.limit} left today.`}</p>;
}
