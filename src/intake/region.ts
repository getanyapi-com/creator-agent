/**
 * The country a quote names, as the intake step's code reads it (round 4, F1; round 5): a country
 * name ("in Germany", "UK-based"), a capitalised code ("US creators"), or a country adjective that
 * describes the people asked for ("American creators", "British TikTokers"). An adjective that
 * describes anything else ("Spanish-learning app", "Italian food") names no country.
 */

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/** Other ways people name a country: short forms and abbreviations the region names above lack. */
const ALIASES: Record<string, string> = {
  usa: "US", "u.s.": "US", "u.s.a.": "US", america: "US", "united states": "US",
  uk: "GB", "u.k.": "GB", britain: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
};

/**
 * Country adjectives, each counted only when a word for people follows it directly. The list is the
 * adjectives of the countries a question is likely to name; a missing one reads as no country, never
 * as a wrong one.
 */
const ADJECTIVES: Record<string, string> = {
  american: "US", british: "GB", scottish: "GB", welsh: "GB", irish: "IE", canadian: "CA",
  australian: "AU", german: "DE", french: "FR", spanish: "ES", italian: "IT", portuguese: "PT", dutch: "NL",
  mexican: "MX", brazilian: "BR", argentinian: "AR", colombian: "CO", indian: "IN", japanese: "JP",
  korean: "KR", "south korean": "KR", chinese: "CN", filipino: "PH", indonesian: "ID", nigerian: "NG",
  "south african": "ZA", swedish: "SE", norwegian: "NO", danish: "DK", polish: "PL", turkish: "TR",
};

/** Words for the people a question asks for, which make the adjective before them a country. */
const PEOPLE = "creators?|influencers?|tiktokers?|youtubers?|accounts?|people|users?|students?|moms?|mums?|dads?|parents?";

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every two-letter region code that names a country, with its English name lowercased. */
function regionNames(): Map<string, string> {
  const out = new Map<string, string>(Object.entries(ALIASES));
  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      const name = REGION_NAMES.of(code);
      if (name && name !== code && !/unknown/i.test(name)) out.set(name.toLowerCase(), code);
    }
  }
  return out;
}

const NAMES = [...regionNames()].map(([name, code]) => ({ code, re: new RegExp(`(?<![\\w.])${escape(name)}(?![\\w])`) }));
const CODES = new Set(NAMES.map((n) => n.code));
const ADJECTIVE_RES = Object.entries(ADJECTIVES).map(([word, code]) => ({ code, re: new RegExp(`(?<![\\w-])${escape(word)} (?:${PEOPLE})\\b`) }));

/** The single country a quote names, as a two-letter code; null when it names none or several. */
export function regionValue(quote: string): string | null {
  const found = new Set<string>();
  // A code counts only in capitals: "us" is a word, "US" the country.
  for (const m of quote.matchAll(/\b[A-Z]{2}\b/g)) {
    const code = m[0] === "UK" ? "GB" : m[0];
    if (CODES.has(code)) found.add(code);
  }
  const lower = ` ${quote.toLowerCase().replace(/\s+/g, " ")} `;
  for (const n of NAMES) if (n.re.test(lower)) found.add(n.code);
  for (const a of ADJECTIVE_RES) if (a.re.test(lower)) found.add(a.code);
  return found.size === 1 ? ([...found][0] ?? null) : null;
}
