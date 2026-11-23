export type ContactKind = "email" | "phone" | "messenger" | "link";

export interface Contact {
  kind: ContactKind;
  value: string;
}

/** What a removed contact detail, link or domain becomes in any text a model or the answer sees. */
export const CONTACT_PLACEHOLDER = "[removed]";

/** Where a text came from: TikTok text loses every link; text from the user or a model keeps links to TikTok. */
export type TextSource = "tiktok" | "user";

const FORMAT_CHARS = /[\p{Cf}­]/gu;
const ENTITIES: Record<string, string> = { commat: "@", period: ".", lpar: "(", rpar: ")", lsqb: "[", rsqb: "]", plus: "+", amp: "&" };
/**
 * Every run in these patterns is bounded by the limits of what it matches, so no pattern can scan
 * further than that from any starting point and the cleaner runs in time proportional to its input
 * (round 4, F3): an email's local part is at most 64 characters (RFC 5321, 4.5.3.1.1), a domain label
 * at most 63 and a domain at most 253, so at most 127 labels (RFC 1035, 2.3.4). A match starts only
 * where a word starts.
 */
const LOCAL = String.raw`(?<![A-Za-z0-9])[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}`;
/** A local part in quotes, straight or curly ("booking"@example.com, round 4 F2). */
const QUOTED_LOCAL = String.raw`["“'‘][^"“”'‘’\s]{1,64}["”'’]`;
const LABEL = String.raw`[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?`;
const TLD = String.raw`[A-Za-z]{2,63}`;
const OPEN = String.raw`[([{<]`;
const CLOSE = String.raw`[)\]}>]`;
/** An @ glued to the name, or spaced on both sides; "follow @name" is a TikTok mention, not an email. */
const AT_SIGN = String.raw`(?:@\s*|\s+@\s+)`;
const AT_WORD = String.raw`(?:\s*${OPEN}\s*at\s*${CLOSE}\s*|\s+at\s+)`;
/** "dot" written as a word or in brackets, never a plain period: "done. Me too" is a sentence, not a domain. */
const DOT_WORD = String.raw`(?:\s*${OPEN}\s*(?:dot|\.)\s*${CLOSE}\s*|\s+dot\s+)`;
const DOT_ANY = String.raw`(?:\s*\.\s*|\s*${OPEN}\s*(?:dot|\.)\s*${CLOSE}\s*|\s+dot\s+)`;
const TLD_WORDS = "com|net|org|co|io|edu|me|us|uk|ca|de|fr|info|biz|ai|app|xyz|gmail";
/** Mail hosts named without a domain ("jane at gmail"); "live" and "mail" only after an @, as words they are common. */
const MAIL_HOSTS = "gmail|googlemail|yahoo|hotmail|outlook|icloud|protonmail|proton|aol|gmx";
/** Networks named as a way to reach someone; the ambiguous short ones count only with a colon. */
const NETWORKS =
  "instagram|insta|ig|snapchat|snap|telegram|tg|whats\\s?app|wechat|discord|kik|viber|facebook|fb|twitter|youtube|yt|linkedin|kakao(?:talk)?|onlyfans|fansly|patreon|twitch|pinterest|tumblr|bluesky|bsky|reddit|substack|cash\\s?app|venmo|paypal";
const NETWORKS_COLON_ONLY = "x|sc|wa|line|signal|threads|kick";
/** Networks whose name followed by a bare word is read as a handle there ("Instagram ambercreates"); "snap" is too common a word. */
const NETWORKS_BARE = "instagram|insta|ig|snapchat|telegram|whats\\s?app|wechat|discord|kik|viber|facebook|fb|twitter|youtube|yt|linkedin|onlyfans|fansly|patreon|twitch|pinterest|tumblr|bluesky|bsky|reddit|substack";
/** Words that ordinarily follow a network's name, so they are not read as a handle on it. */
const AFTER_NETWORK =
  "reels?|stories|story|lives?|posts?|pages?|accounts?|links?|bio|shorts?|channels?|feeds?|dms?|users?|threads?|clips?|photos?|pics?|pictures?|videos?|content|ads?|marketing|growth|creators?|influencers?|algorithm|tips?|trends?|trending|famous|style|filters?|followers?|views?|likes?|comments?|premium|music|business|profile|handle|name|username|data|app|apps|ai|and|or|vs|but|so|if|is|are|was|were|has|have|had|can|will|would|should|could|not|no|yes|just|more|less|now|then|than|too|also|only|for|to|the|an?|my|our|your|their|his|her|its?|this|that|these|those|they|we|you|me|us|in|on|at|with|from|of|by|as|tiktok|people|because|cause|removed";
/** Endings a domain written with a spaced dot is read with ("studio . com"); the short ones that are also words are left out. */
const SPACED_TLDS = "com|net|org|io|edu|info|biz|app|xyz|uk|ca|de|fr";
const HANDLE = String.raw`@?[A-Za-z0-9._]{2,30}`;
const BARE_HANDLE = String.raw`[A-Za-z0-9._]{3,30}`;
/**
 * A separator between phone digits: space, brackets, slash, any dash (the Unicode dash punctuation
 * class and minus), and the dots people use in its place: full stop, middle dot, bullet, hyphenation
 * point, dot operators and the katakana and half-width middle dots (round 4, F2).
 */
const PHONE_SEP = String.raw`[\s()./\p{Pd}\u2212\u00B7\u2022\u2027\u2219\u22C5\u30FB\uFF65]`;
const TIKTOK_LINK = /https:\/\/(?:www\.|m\.)?tiktok\.com\/@[A-Za-z0-9._]{2,24}(?:\/video\/\d+)?(?![\w/.])/gi;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A TikTok mention: @ and a handle by TikTok's rules, not ending in a dot. */
const MENTION = /(?<![\w@/])@([A-Za-z0-9._]{1,23}[A-Za-z0-9_])(?![\w]|\.\w)/g;
const NO_HANDLES: ReadonlySet<string> = new Set();
const DECIMAL = /^\d+\.\d+$/;

interface Pattern {
  kind: ContactKind;
  re: RegExp;
}

/** Each pattern finds one way people write a contact detail, applied in this order. */
const PATTERNS: Pattern[] = [
  { kind: "link", re: /\b(?:mailto|tel|sms):\S+/gi },
  { kind: "link", re: /\b(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|t\.me|telegram\.me)\/\S+/gi },
  { kind: "email", re: new RegExp(String.raw`(?:${QUOTED_LOCAL}|${LOCAL})(?:${AT_SIGN}|${AT_WORD})${LABEL}(?:\.${LABEL}){0,126}\.${TLD}\b`, "gi") },
  /**
   * A space before the @ only ("booking @example.com", round 4 F2), before a common ending. A handle
   * the run holds is set aside first ("Looked at @artofthepossible.ai" is a mention), see `known`.
   */
  { kind: "email", re: new RegExp(String.raw`(?:${QUOTED_LOCAL}|${LOCAL})\s+@${LABEL}(?:\.${LABEL}){0,126}\.(?:${TLD_WORDS})\b`, "gi") },
  { kind: "email", re: new RegExp(String.raw`${LOCAL}(?:${AT_SIGN}|${AT_WORD})${LABEL}(?:${DOT_ANY}${LABEL}){0,126}${DOT_ANY}(?:${TLD_WORDS})\b`, "gi") },
  { kind: "email", re: new RegExp(String.raw`${LOCAL}${AT_SIGN}(?:${MAIL_HOSTS}|live|mail)\b`, "gi") },
  { kind: "email", re: new RegExp(String.raw`${LOCAL}${AT_WORD}(?:${MAIL_HOSTS})\b`, "gi") },
  /** An email written with a link after the @ ("jane@https://studio.com"), seen in a caption on 2026-11-21. */
  { kind: "email", re: new RegExp(String.raw`${LOCAL}${AT_SIGN}(?:https?:\/\/|www\.)[^\s<>"'\`]+`, "gi") },
  { kind: "link", re: /(?<![@\w.])(?:https?:\/\/|www\.)[^\s<>"'`]+/gi },
  { kind: "link", re: new RegExp(String.raw`(?<![@\w.])${LABEL}${DOT_WORD}(?:${TLD_WORDS})\b`, "gi") },
  { kind: "link", re: new RegExp(String.raw`(?<![@\w.])${LABEL}(?:\s+\.\s*|\s*\.\s+)(?:${SPACED_TLDS})\b`, "gi") },
  { kind: "link", re: new RegExp(String.raw`(?<![@\w.])(?:${LABEL}\.){1,127}${TLD}(?![\w-])(?:\/[^\s<>"'\`]*)?`, "gi") },
  { kind: "messenger", re: new RegExp(String.raw`\b(?:${NETWORKS})\b\W{0,4}(?:\w+\s+){0,2}@[A-Za-z0-9._]{2,30}`, "gi") },
  { kind: "messenger", re: new RegExp(String.raw`\b(?:${NETWORKS}|${NETWORKS_COLON_ONLY})\b\s*[:=]\s*${HANDLE}`, "gi") },
  { kind: "messenger", re: new RegExp(String.raw`@[A-Za-z0-9._]{2,30}\s+(?:on|at|via|in)\s+(?:my\s+)?(?:${NETWORKS})\b`, "gi") },
  {
    kind: "messenger",
    re: new RegExp(String.raw`\b(?:dm|message|msg|text|contact|reach|add|hmu)\s+(?:me\s+)?(?:at\s+)?@?[A-Za-z0-9._]{2,30}\s+(?:on|at|via|in)\s+(?:my\s+)?(?:${NETWORKS})\b`, "gi"),
  },
  { kind: "messenger", re: new RegExp(String.raw`\b(?:${NETWORKS_BARE})\b[^\p{L}\p{N}\n]{1,4}(?!(?:${AFTER_NETWORK})\b)${BARE_HANDLE}`, "giu") },
  { kind: "phone", re: new RegExp(String.raw`(?<![\w+])(?:\+|00)?\d(?:${PHONE_SEP}{0,3}\d){6,14}(?!\w)`, "gu") },
];

/** A character for a numeric entity; one outside Unicode becomes the replacement character, never an exception (round 4, B4). */
function codePoint(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\uFFFD";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

const DIGIT = /\p{Nd}/u;

/**
 * Reads a digit of any script as its ASCII digit. Unicode encodes each script's digits zero to nine
 * in a run of consecutive code points, runs of several sets in multiples of ten, so a digit's value is
 * its distance from the start of its run, modulo ten.
 */
export function foldDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0) ?? 0;
    if (cp <= 0x39) return d;
    let start = cp;
    while (DIGIT.test(String.fromCodePoint(start - 1))) start -= 1;
    return String((cp - start) % 10);
  });
}

/** Letters, digits, @ and dots written one by one with spaces between ("a m b e r @ e x a m p l e . c o m"). */
const LETTER_SPACED = /(?<![\w@.])(?:[A-Za-z0-9@.] )+[A-Za-z0-9@.](?![\w@.])/g;

/** Joins letter-spaced text that spells an email, so the patterns below see it whole. */
function joinLetterSpaced(text: string): string {
  return text.replace(LETTER_SPACED, (run) => {
    const joined = run.replace(/ /g, "");
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(joined) ? joined : run;
  });
}

/**
 * Undoes the tricks used to hide characters: HTML entities, full-width forms, zero-width and other
 * invisible characters, digits of other scripts, and letter-spaced emails.
 */
export function normalizeText(text: string): string {
  return joinLetterSpaced(foldDigits(decodeEntities(text).normalize("NFKC").replace(FORMAT_CHARS, "")));
}

/** A date or a decimal looks like a run of digits but is not a phone number. */
function notAPhone(match: string): boolean {
  const trimmed = match.trim();
  return DATE.test(trimmed) || DECIMAL.test(trimmed);
}

/**
 * Removes every contact detail from a text and returns the cleaned text with what was removed.
 * TikTok text also loses every link and bare domain; text from the user or a model keeps only links
 * to a TikTok profile or video, which the code itself builds.
 */
export function stripContacts(text: string, source: TextSource = "tiktok", known: ReadonlySet<string> = NO_HANDLES): { clean: string; contacts: Contact[] } {
  let clean = normalizeText(text);
  const kept: string[] = [];
  const setAside = (found: string): string => {
    kept.push(found);
    return `\uE000${kept.length - 1}\uE000`;
  };
  // TikTok links, and mentions of handles the run holds, are set aside under a private-use marker while the patterns run, then put back.
  if (source === "user") clean = clean.replace(TIKTOK_LINK, setAside);
  if (known.size) clean = clean.replace(MENTION, (m, h: string) => (known.has(h.toLowerCase()) ? setAside(m) : m));
  const contacts: Contact[] = [];
  for (const { kind, re } of PATTERNS) {
    clean = clean.replace(re, (match) => {
      if (kind === "phone" && notAPhone(match)) return match;
      contacts.push({ kind, value: match.trim() });
      return CONTACT_PLACEHOLDER;
    });
  }
  clean = clean.replace(/\uE000(\d+)\uE000/g, (_, i: string) => kept[Number(i)] ?? "");
  return { clean, contacts };
}

/** True when the text still holds anything the cleaner would remove. */
export function containsContact(text: string, source: TextSource = "tiktok"): boolean {
  return stripContacts(text, source).contacts.length > 0;
}
