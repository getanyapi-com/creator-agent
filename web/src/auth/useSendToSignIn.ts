"use client";

import { useRouter } from "next/navigation";

/** Takes a visitor to sign-in; Clerk brings them back to this page, dev bar choices included, once they are in. */
export function useSendToSignIn(): () => void {
  const router = useRouter();
  return () => {
    const back = `${window.location.pathname}${window.location.search}`;
    router.push(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
  };
}
