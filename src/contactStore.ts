import type { Contact } from "./contacts.ts";
import { normalizeHandle } from "./evidence.ts";

/** Where a contact detail was found: the bio or profile link, a caption or hashtag, a transcript, or the video itself. */
export type ContactSource = "bio" | "caption" | "transcript" | "video";

export interface StoredContact extends Contact {
  source: ContactSource;
}

/** Contact details found in TikTok text, kept apart from evidence and never shown to a model. */
export interface ContactStore {
  add(handle: string, contacts: Contact[], source: ContactSource): void;
  hasEmail(handle: string): boolean;
  count(): number;
  snapshot(): Record<string, StoredContact[]>;
}

export function isEmail(c: Contact): boolean {
  return c.kind === "email" || /^mailto:/i.test(c.value);
}

export class MemoryContactStore implements ContactStore {
  readonly #byCreator = new Map<string, StoredContact[]>();

  add(handle: string, contacts: Contact[], source: ContactSource): void {
    const key = normalizeHandle(handle);
    this.#byCreator.set(key, [...(this.#byCreator.get(key) ?? []), ...contacts.map((c) => ({ ...c, source }))]);
  }

  hasEmail(handle: string): boolean {
    return (this.#byCreator.get(normalizeHandle(handle)) ?? []).some(isEmail);
  }

  count(): number {
    let n = 0;
    for (const list of this.#byCreator.values()) n += list.length;
    return n;
  }

  snapshot(): Record<string, StoredContact[]> {
    return Object.fromEntries(this.#byCreator);
  }
}
