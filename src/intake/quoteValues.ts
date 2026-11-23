/**
 * What the code itself reads from the words of a question that state one limit (round 4, F1): the
 * number or the number of days (the country is read in `region.ts`). The intake step accepts a
 * model's proposed check only when the value read here from its quote equals the proposed value.
 */

const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6 };
/** A figure as people write it: "10,000", "10K", "1.5k", "100 thousand". */
const FIGURE = /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|thousand|million)?(?![a-z])/gi;
/** A word or sign right before a figure that makes it a target, not a limit ("around 1,500", "~2k"). */
const APPROXIMATE = /(?:\b(?:around|about|approximately|approx|roughly|nearly|near|close to)|~)\s*$/i;
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, dozen: 12,
};
const UNIT_DAYS: Record<string, number> = { hour: 1 / 24, day: 1, week: 7, fortnight: 14, month: 30, year: 365 };
/** A recent window named without a figure: "this month" is the last thirty days. */
const NAMED_WINDOW = /\b(?:this|past|last)\s+(day|week|fortnight|month|year)\b|\b(today)\b/gi;

/** Tens as words, for figures written out ("fifty thousand"). */
const TENS: Record<string, number> = { thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
/** A figure written in words: "a million", "half a million", "ten thousand", "a hundred thousand". */
const WORD_FIGURE = /(?<![\w-])(half an?|an?|[a-z]+)(?: (hundred))? (thousand|million)\b/gi;

/** The value of a figure written in words, or null when its first word is no number. */
function wordFigure(m: RegExpMatchArray): number | null {
  const lead = (m[1] ?? "").toLowerCase();
  const n = /^half an?$/.test(lead) ? 0.5 : /^an?$/.test(lead) ? 1 : (NUMBER_WORDS[lead] ?? TENS[lead]);
  if (n === undefined) return null;
  return n * (m[2] ? 100 : 1) * (SCALE[(m[3] ?? "").toLowerCase()] ?? 1);
}

/** Typographic dashes and "to" between figures read as the hyphen of a range ("10K–50K", "5k to 20k"). */
const normalised = (quote: string): string => quote.replace(/[\u2012-\u2015\u2212]/g, "-");

/** Every figure in a quote, in order, read as a number; null when one is approximate (a target, not a limit). */
export function figuresIn(quote: string): number[] | null {
  const text = normalised(quote);
  const found: { at: number; end: number; value: number; scale: number }[] = [];
  for (const m of text.matchAll(FIGURE)) {
    const before = text.slice(0, m.index);
    if (APPROXIMATE.test(before) || /^\s*-?ish\b/i.test(text.slice(m.index + m[0].length))) return null;
    const scale = SCALE[(m[2] ?? "").toLowerCase()] ?? 1;
    found.push({ at: m.index, end: m.index + m[0].length, value: Number((m[1] ?? "").replace(/,/g, "")) * scale, scale });
  }
  for (const m of text.matchAll(WORD_FIGURE)) {
    const value = wordFigure(m);
    if (value === null) continue;
    if (APPROXIMATE.test(text.slice(0, m.index))) return null;
    found.push({ at: m.index, end: m.index + m[0].length, value, scale: SCALE[(m[3] ?? "").toLowerCase()] ?? 1 });
  }
  found.sort((a, b) => a.at - b.at);
  // "5-20k" is five to twenty thousand: a bare figure joined to a scaled one by a dash or "to" takes its scale.
  return found.map((f, i) => {
    const next = found[i + 1];
    const joined = next !== undefined && f.scale === 1 && next.scale > 1 && /^\s*(?:-|to)\s*$/i.test(text.slice(f.end, next.at));
    return joined && f.value * next.scale < next.value ? f.value * next.scale : f.value;
  });
}

/** A range a quote states ("between 5K and 20K", "10k-50k", "from 1,000 to 10,000"): its two ends, low first; null when it states none. */
export function rangeIn(quote: string): [number, number] | null {
  const text = normalised(quote);
  if (!/\bbetween\b[\s\S]*\band\b|\d\s*[kKmM]?\s*(?:-|\bto\b)\s*\d/i.test(text)) return null;
  const figures = figuresIn(text);
  if (!figures || figures.length !== 2) return null;
  const [a = 0, b = 0] = figures;
  return a < b ? [a, b] : null;
}

/** The single value a quote states, or null when it states none, several, or an approximate one. */
function single(values: number[] | null): number | null {
  const distinct = [...new Set(values ?? [])];
  return distinct.length === 1 ? (distinct[0] ?? null) : null;
}

const AT_MOST = /\b(?:under|below|less than|fewer than|at most|max(?:imum)?|up to|sub|no more than|smaller than|within|or (?:less|fewer|under|below)|and (?:under|below))\b|[<≤]/i;
const AT_LEAST = /\b(?:over|above|more than|at least|min(?:imum)?|exceed(?:s|ing)?|beyond|or (?:more|above|over)|and (?:up|above|over)|plus)\b|[>≥+]/i;
const VIEWS = /\b(?:views?|plays?|viewed)\b/i;

/**
 * The follower limit a quote states in the given direction ("under 10,000 followers", "sub-10K",
 * "20K or fewer"); a range ("between 5K and 20K followers", "10k-50k") states both ends.
 */
export function followerValue(quote: string, direction: "at_most" | "at_least"): number | null {
  if (VIEWS.test(quote)) return null;
  const range = rangeIn(quote);
  if (range) return direction === "at_most" ? range[1] : range[0];
  if (!(direction === "at_most" ? AT_MOST : AT_LEAST).test(quote)) return null;
  return single(figuresIn(quote));
}

/** The view floor a quote states ("over 100,000 views", "1M+ views"); a range's lower end is its floor. */
export function viewsValue(quote: string): number | null {
  if (!VIEWS.test(quote)) return null;
  const range = rangeIn(quote);
  if (range) return range[0];
  if (!AT_LEAST.test(quote)) return null;
  return single(figuresIn(quote));
}

/** The recency window a quote states, in days ("in the last 30 days", "this month", "past two weeks"). */
export function daysValue(quote: string): number | null {
  const days: number[] = [];
  const counted = /\b(\d+|[a-z]+)\s+(hour|day|week|fortnight|month|year)s?\b/gi;
  for (const m of quote.matchAll(counted)) {
    const raw = (m[1] ?? "").toLowerCase();
    const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
    if (n !== undefined) days.push(n * (UNIT_DAYS[(m[2] ?? "").toLowerCase()] ?? 0));
  }
  for (const m of quote.matchAll(NAMED_WINDOW)) days.push(m[2] ? 1 : (UNIT_DAYS[(m[1] ?? "").toLowerCase()] ?? 0));
  // Hours count as the days they reach into: "the last 48 hours" is the last two days.
  return single(days.filter((d) => d > 0).map((d) => Math.ceil(d - 1e-9)));
}

/** How many creators a quote asks for ("10 US creators", "five creators", "a dozen"). */
export function wantedValue(quote: string): number | null {
  const words = [...quote.toLowerCase().matchAll(/\b[a-z]+\b/g)].map((m) => NUMBER_WORDS[m[0]]).filter((n): n is number => n !== undefined);
  const figures = figuresIn(quote);
  return figures === null ? null : single([...figures, ...words]);
}
