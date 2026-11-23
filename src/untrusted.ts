import { stripContacts, type Contact } from "./contacts.ts";

const OPEN = "<tiktok_text>";
const CLOSE = "</tiktok_text>";
const MARKERS = /<\/?\s*tiktok_text\s*>/gi;

export type ContactSink = (contacts: Contact[]) => void;

/** Cuts text to `maxChars` whole characters, never half an emoji (which would leave invalid text in saved JSON). */
export function clip(text: string, maxChars: number): string {
  const chars = Array.from(text);
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join("")}...` : text;
}

/**
 * Cleans text written by TikTok users, or by the video model about a TikTok video, before it is
 * stored or shown to a model: contact details, links and domains go to the sink, whitespace
 * collapses, and the text is cut to `maxChars`.
 */
export function cleanText(raw: string | null | undefined, maxChars: number, sink: ContactSink): string {
  if (!raw) return "";
  const { clean, contacts } = stripContacts(raw, "tiktok");
  if (contacts.length > 0) sink(contacts);
  return clip(clean.replace(MARKERS, " ").replace(/\s+/g, " ").trim(), maxChars);
}

/** Wraps already cleaned text so the model sees where TikTok data starts and ends. */
export function wrapData(clean: string): string {
  return clean ? `${OPEN}${clean}${CLOSE}` : "";
}
