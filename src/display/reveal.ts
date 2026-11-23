import { isEmail } from "../contactStore.ts";
import { normalizeHandle } from "../evidence.ts";
import type { RunOutput } from "../trace.ts";
import type { RevealedContact } from "./types.ts";

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** An email as it was found ("ann (at) example dot com", "mailto:ann@example.com?subject=x"), written plainly. */
export function readableEmail(found: string): string {
  const plain = found
    .replace(/^mailto:/i, "")
    .replace(/\?.*$/, "")
    .replace(/\s*[([{<]\s*at\s*[)\]}>]\s*|\s+at\s+/gi, "@")
    .replace(/\s*[([{<]\s*(?:dot|\.)\s*[)\]}>]\s*|\s+dot\s+/gi, ".")
    .replace(/\s+/g, "");
  return EMAIL.test(plain) ? plain : found.trim();
}

/**
 * One creator's contact details for a Reveal, from the private record: the first email found in the
 * creator's public bio or profile link, or null. Emails found in captions, transcripts or videos are
 * not offered. The only path by which a contact detail leaves the server.
 */
export function revealContact(run: RunOutput, handle: string): RevealedContact {
  const h = normalizeHandle(handle);
  const email = (run.contacts[h] ?? []).find((c) => c.source === "bio" && isEmail(c));
  return { handle: h, email: email ? readableEmail(email.value) : null };
}
