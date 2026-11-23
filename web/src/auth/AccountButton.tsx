"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import { useSendToSignIn } from "./useSendToSignIn";

/** The header's account control: Sign in for a visitor, Clerk's account button once signed in. */
export function AccountButton() {
  const { isLoaded, isSignedIn } = useAuth();
  const sendToSignIn = useSendToSignIn();
  if (!isLoaded) return null;
  if (isSignedIn) {
    return (
      <span className="ml-1 inline-flex">
        <UserButton />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={sendToSignIn}
      className="rounded-control border px-3 py-1.5 text-small font-medium transition-motion hover:bg-surface-2"
    >
      Sign in
    </button>
  );
}
