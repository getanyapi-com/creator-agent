/**
 * An independent contact detector for scoring saved runs. It shares no code with the cleaner in
 * `src/contacts.ts` and is stricter, so a bug in the cleaner cannot hide itself: it flags anything
 * that looks like an email, phone number, link, domain or a handle on another network, after setting
 * aside only the strings the code itself writes (TikTok profile and video links, timestamps, AnyAPI
 * endpoint names, the two services' own hosts, and TikTok image links in the two media fields).
 */

/**
 * Every run in these patterns is bounded by what it can match (an email's local part 64 characters,
 * a domain label 63, at most 127 labels; a handle 30), and a match starts only where a word starts,
 * so the detector runs in time proportional to its input (round 4, F3).
 */
const CODE_WRITTEN: RegExp[] = [
  /https:\/\/(?:www\.|m\.)?tiktok\.com\/@[A-Za-z0-9._]{2,24}(?:\/video\/\d+)?(?![\w/.])/gi,
  /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?\b/g,
  /\btiktok\.[a-z_]+\b/g,
  /\b(?:api\.)?(?:getanyapi\.com|surplusintelligence\.ai)\b/gi,
];

interface Rule {
  name: string;
  re: RegExp;
}

const NETWORK =
  "instagram|insta|ig|snapchat|snap|telegram|tg|whats\\s*app|wechat|discord|kik|viber|twitter|facebook|fb|youtube|yt|linkedin|kakao\\w*|onlyfans|fansly|patreon|twitch|reddit|pinterest|tumblr|bluesky|bsky|venmo|cash\\s*app|paypal";
/** Words that are also ordinary words ("me x @friend" is a TikTok collab), counted only before a colon. */
const NETWORK_COLON = "x|sc|wa|line|signal|threads";

const RULES: Rule[] = [
  // A glued dot before any ending of two or more letters, or a spaced or written-out dot before a common mail ending.
  { name: "email", re: /(?<![\w.+-])[\w.+-]{1,64}(?:@\s*|\s+@\s+|\s*(?:\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\}|<\s*at\s*>)\s*)[\w-]{1,63}(?:\.[\w-]{1,63}){0,126}\.[a-z]{2,63}\b/i },
  { name: "email", re: /(?<![\w.+-])[\w.+-]{1,64}(?:@\s*|\s+@\s+|\s*(?:\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\}|<\s*at\s*>)\s*)[\w-]{1,63}(?:\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\s+dot\s+)\s*[\w-]{1,63}){0,126}\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\s+dot\s+)\s*(?:com|net|org|co|io|edu|me|us|uk|ca|de|fr|info|biz|ai|app|xyz)\b/i },
  { name: "email word", re: /\b(?:at|@)\s+(?:gmail|googlemail|yahoo|hotmail|outlook|icloud|proton\w*|aol|gmx)\b/i },
  { name: "obfuscated at or dot", re: /[([{<]\s*(?:at|dot)\s*[)\]}>]|\bdot\s+(?:com|net|org|co|io|me|ai|app)\b/i },
  { name: "url", re: /\b(?:https?|ftp|mailto|tel|sms):|\bwww\./i },
  { name: "domain", re: /(?<![@\w.-])[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,126}\.[a-z]{2,63}(?![\w-])/i },
  { name: "network handle", re: new RegExp(String.raw`\b(?:${NETWORK}|${NETWORK_COLON})\s*[:=]\s*@?[\w.]{2,30}`, "i") },
  { name: "network handle", re: new RegExp(String.raw`\b(?:${NETWORK})\b\W{0,4}(?:\w{1,30}\s+){0,2}@[\w.]{2,30}`, "i") },
  { name: "network handle", re: new RegExp(String.raw`@[\w.]{2,30}\s+(?:on|at|via|in)\s+(?:my\s+)?(?:${NETWORK})\b`, "i") },
  // round 4 review: a network named before a bare name that ends the text or a list item ("IG 📸 name"),
  // and a request to message someone there ("DM name on Instagram")
  { name: "network handle", re: new RegExp(String.raw`\b(?:${NETWORK})\b[^\p{L}\p{N}\n]{1,6}[\p{L}\p{N}._]{3,30}\s*(?:$|[|•,;)\n])`, "iu") },
  { name: "network handle", re: new RegExp(String.raw`\b(?:dm|message|msg|text|contact|reach|add)\s+(?:me\s+)?@?[\w.]{2,30}\s+(?:on|at|via)\s+(?:${NETWORK})\b`, "i") },
  // a space before the dot ("studio . com"), or after it before an ending that is not also a word: a
  // sentence's full stop is followed by a space ("with you. AI messed this up" is not a domain)
  { name: "spaced domain", re: /(?<![\w-])[a-z0-9-]{2,63}(?:\s+\.\s*(?:com|net|org|io|co|app|ai|xyz|info|biz)|\.\s+(?:com|net|org|io|xyz|info|biz))\b/i },
];

/** A phone number: 7 to 15 digits (E.164 allows 15) with any common separators, not part of a longer number. */
const PHONE = /(?<![\w.])\+?\d(?:[\s().\-/]{0,4}\d){6,14}(?![\w])/g;

const entity = (n: number): string => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ");

/** A digit of any script as an ASCII digit: its offset from the first digit of its run of digits, modulo ten. */
function asciiDigit(d: string): string {
  let first = d.codePointAt(0) ?? 48;
  const cp = first;
  while (/\p{Nd}/u.test(String.fromCodePoint(first - 1))) first -= 1;
  return String((cp - first) % 10);
}

function prepare(text: string): string {
  let t = text
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => entity(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => entity(Number(d)))
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .normalize("NFKC")
    .replace(/[\p{Cf}­]/gu, "")
    .replace(/[^\P{Nd}0-9]/gu, asciiDigit)
    .replace(/[\p{Pd}\u2212]/gu, "-")
    // round 4, F2: the dots people use between phone digits, a space before an email's @, and a quoted local part
    .replace(/[\u00B7\u2022\u2027\u2219\u22C5\u30FB\uFF65]/g, ".")
    .replace(/(\S)\s+@(?=[\w-]{1,63}(?:\.[\w-]{1,63}){0,126}\.(?:com|net|org|co|io|edu|me|us|uk|ca|de|fr|info|biz|ai|app|xyz)\b)/gi, "$1@")
    .replace(/["“'‘]([^"“”'‘’\s]{1,64})["”'’]\s*@/g, "$1@")
    // single characters spaced one by one ("j a n e @ e x a m p l e . c o m") are read joined
    .replace(/(?:(?<=^|\s)\S ){2,}\S(?=\s|$)/g, (run) => run.replace(/ /g, ""));
  for (const re of CODE_WRITTEN) t = t.replace(re, " ");
  return t;
}

/** The contact-like things in one string, named by the rule that found each. */
export function contactsIn(text: string, handles: ReadonlySet<string> = new Set()): string[] {
  const t = prepare(withoutMentions(text, handles));
  const found = RULES.filter((r) => r.re.test(t)).map((r) => r.name);
  for (const m of t.matchAll(PHONE)) {
    if (!/^\d+\.\d+$/.test(m[0])) found.push(`phone ${m[0].replace(/\d(?=\d{2})/g, "#")}`);
  }
  return found;
}

/** The object or array a string holds as JSON (tool arguments, tool results), or undefined for plain text. */
function jsonInside(text: string): unknown {
  if (!/^\s*[[{]/.test(text)) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Fields whose value the code writes as a bare TikTok handle; a handle with a dot is not a domain there. */
const HANDLE_KEYS = new Set(["handle", "author", "creator", "notFound"]);
const HANDLE = /^@?[a-z0-9._]{2,24}$/i;

/**
 * Fields the code fills with a profile picture or cover image link for the web app. Only a whole
 * https link on TikTok's image CDN is set aside there; anything else in them is scanned as usual.
 */
const MEDIA_KEYS = new Set(["avatarUrl", "image", "imageUrl"]);
const TIKTOK_IMAGE = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.tiktokcdn(?:-us|-eu)?\.com\/\S*$/i;

/** Every string anywhere in a JSON value, strings that hold JSON included, except bare handles in handle fields and TikTok image links in media fields. */
/** A media link is set aside only when nothing in it, with its percent-encoding undone, could hold a contact (round 4, F2). */
function plainMediaLink(value: string): boolean {
  let text: string;
  try {
    text = decodeURIComponent(value);
  } catch {
    return false;
  }
  return TIKTOK_IMAGE.test(value) && !/[@#]|\b(?:mailto|tel|sms):/i.test(text);
}

function strings(value: unknown, out: string[] = [], key = ""): string[] {
  if (typeof value === "string" && HANDLE_KEYS.has(key) && HANDLE.test(value)) return out;
  if (typeof value === "string" && MEDIA_KEYS.has(key) && plainMediaLink(value)) return out;
  if (typeof value === "string") {
    const inner = jsonInside(value);
    if (inner === undefined) out.push(value);
    else strings(inner, out, key);
  } else if (Array.isArray(value)) {
    value.forEach((v) => strings(v, out, key));
  } else if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([k, v]) => strings(v, out, k));
  }
  return out;
}

/** A mention of a handle the scanned object itself lists in a handle field, set aside: "Looked at @studio.ai" names a creator (round 4, F2). */
function withoutMentions(text: string, handles: ReadonlySet<string>): string {
  if (handles.size === 0) return text;
  return text.replace(/(?<![\w@/])@([a-z0-9._]{1,23}[a-z0-9_])(?![\w]|\.\w)/gi, (m, h: string) => (handles.has(h.toLowerCase()) ? " " : m));
}

/** Every bare handle in a handle field anywhere in a JSON value. */
function handleValues(value: unknown, out = new Set<string>(), key = ""): Set<string> {
  if (typeof value === "string" && HANDLE_KEYS.has(key) && HANDLE.test(value)) out.add(value.replace(/^@/, "").toLowerCase());
  else if (Array.isArray(value)) value.forEach((v) => handleValues(v, out, key));
  else if (typeof value === "object" && value !== null) Object.entries(value).forEach(([k, v]) => handleValues(v, out, k));
  return out;
}

/** Scans a whole saved run file; returns what was found, with phone digits masked. */
export function scanForContacts(fileText: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    parsed = fileText;
  }
  const handles = handleValues(parsed);
  return strings(parsed).flatMap((s) => contactsIn(s, handles).map((what) => `${what} in "${s.slice(0, 40).replace(/\d/g, "#")}..."`));
}
