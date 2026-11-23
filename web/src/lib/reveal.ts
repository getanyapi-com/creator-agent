"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, useContext } from "react";
import { useSendToSignIn } from "@/auth/useSendToSignIn";
import type { RevealResult } from "@/data/live";
import { useViewState } from "@/dev/useViewState";

export type { RevealResult } from "@/data/live";

/** The thread a Reveal belongs to, provided once by the thread page so every creator on it can ask for it. */
export const RevealThreadContext = createContext<string>("");

/** The page is leaving for sign-in, so the click gives nothing here; the promise is left to be dropped with the page. */
function leaveForSignIn(sendToSignIn: () => void): Promise<RevealResult> {
  sendToSignIn();
  return new Promise<RevealResult>(() => undefined);
}

/**
 * What the Reveal route's answer, other than a sign-in one, means for the button. A 503 is the route saying it could not
 * check the wallet with AnyAPI, so its message is shown and Reveal can be pressed again; any other failure finds no email.
 */
export async function revealAnswer(res: Response): Promise<RevealResult> {
  if (res.status === 503) {
    const error = ((await res.json().catch(() => null)) as { error?: unknown } | null)?.error;
    if (typeof error === "string") return { kind: "retry", message: error };
  }
  if (!res.ok) return { kind: "none" };
  return (await res.json()) as RevealResult;
}

/**
 * What pressing Reveal gives, asked from the server at the moment of the click. A visitor is sent to sign in; the server
 * decides the tier and reveals nothing on the free one. `tier` is the dev bar's override, which only a dev build honours.
 */
export function useRevealContact(): (handle: string) => Promise<RevealResult> {
  const threadId = useContext(RevealThreadContext);
  const { isSignedIn } = useAuth();
  const sendToSignIn = useSendToSignIn();
  const [{ tier }] = useViewState();
  return async (handle) => {
    // A known visitor goes straight to sign-in; otherwise the server decides, so a click before Clerk has loaded is answered right.
    if (isSignedIn === false) return leaveForSignIn(sendToSignIn);
    const res = await fetch("/api/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, handle, tier }),
    });
    if (res.status === 401) return leaveForSignIn(sendToSignIn);
    return revealAnswer(res);
  };
}
