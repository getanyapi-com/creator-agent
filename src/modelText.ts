import { stripContacts } from "./contacts.ts";

/** Text written by the user or a model, cleaned: contacts become [removed]; links to TikTok stay. */
export interface Cleaned<T> {
  value: T;
  /** How many contact details were removed. */
  removed: number;
}

/** `handles`: the run's own handles, whose mentions stay ("@studio.ai" is a creator, not a domain). */
export function cleanUserText(text: string, handles?: ReadonlySet<string>): Cleaned<string> {
  const { clean, contacts } = stripContacts(text, "user", handles);
  return { value: clean, removed: contacts.length };
}

/**
 * A TikTok handle in a `handle` field is an identifier the tools validate, not free text; one with a
 * dot ("studyfetch.kendall") would otherwise read as a domain and be removed.
 */
const HANDLE_FIELD = /^@?[A-Za-z0-9._]{2,24}$/;

/** Cleans every string inside a JSON value (tool-call arguments, a finish), keeping its shape. */
export function cleanDeep(value: unknown): Cleaned<unknown> {
  let removed = 0;
  const walk = (v: unknown, key = ""): unknown => {
    if (typeof v === "string" && key === "handle" && HANDLE_FIELD.test(v.trim())) return v;
    if (typeof v === "string") {
      const c = cleanUserText(v);
      removed += c.removed;
      return c.value;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (typeof v === "object" && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return { value: walk(value), removed };
}

/** Tool-call arguments as the model wrote them (a JSON string), cleaned; text that is not JSON is cleaned as text. */
export function cleanArguments(raw: string): Cleaned<string> {
  try {
    const cleaned = cleanDeep(JSON.parse(raw || "{}"));
    return { value: JSON.stringify(cleaned.value), removed: cleaned.removed };
  } catch {
    return cleanUserText(raw);
  }
}
