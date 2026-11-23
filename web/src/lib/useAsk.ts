"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";
import { noneLeftMessage, type Allowance } from "@/auth/allowance";
import { useSendToSignIn } from "@/auth/useSendToSignIn";
import { useHref } from "@/dev/useHref";

export interface Ask {
  ask: (question: string) => void;
  pending: boolean;
  error: string | null;
  /** True when the error is that the account has used today's free questions. */
  noneLeft: boolean;
}

/** Where a visitor's question waits while they sign in, in this tab only. */
const HELD = "held-question";

function hold(question: string): void {
  try {
    sessionStorage.setItem(HELD, question);
  } catch {
    // Storage can be off; the visitor then types the question again after signing in.
  }
}

function takeHeld(): string | null {
  try {
    const question = sessionStorage.getItem(HELD);
    sessionStorage.removeItem(HELD);
    return question;
  } catch {
    return null;
  }
}

/**
 * Starts a real question on the server and goes to its thread page, where the research shows as it runs.
 * A visitor is sent to sign in first; the question is held and, once they are back signed in, put back in
 * the box through `setText` and asked without retyping.
 */
export function useAsk(setText: (question: string) => void): Ask {
  const router = useRouter();
  const href = useHref();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const sendToSignIn = useSendToSignIn();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noneLeft, setNoneLeft] = useState(false);

  const signInFirst = (question: string) => {
    hold(question);
    sendToSignIn();
  };

  const submit = (question: string) => {
    setPending(true);
    setError(null);
    setNoneLeft(false);
    fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; allowance?: Allowance };
        if (res.status === 401) return signInFirst(question);
        if (res.status === 429 && body.allowance !== undefined) {
          setNoneLeft(true);
          throw new Error(noneLeftMessage(body.allowance));
        }
        // The wallet connection has just ended: the server now shows the account free, so the page is redrawn from it.
        if (res.status === 409) router.refresh();
        if (!res.ok || body.id === undefined) throw new Error(body.error ?? "The question could not be started.");
        router.push(href(`/t/${body.id}`));
      })
      .catch((err: unknown) => {
        setPending(false);
        setError(err instanceof Error ? err.message : "The question could not be started.");
      });
  };

  const resume = useEffectEvent(() => {
    const held = takeHeld();
    if (held === null) return;
    setText(held);
    submit(held);
  });

  // Clerk tells its listeners the session as soon as it knows it, and again whenever it changes.
  useEffect(
    () =>
      clerk.addListener(({ session }) => {
        if (session) resume();
      }),
    [clerk],
  );

  const ask = (question: string) => {
    if (pending || question.trim() === "") return;
    // Before Clerk has loaded, the server's answer decides: a 401 sends the visitor to sign in.
    if (isSignedIn === false) return signInFirst(question);
    submit(question);
  };
  return { ask, pending, error, noneLeft };
}
