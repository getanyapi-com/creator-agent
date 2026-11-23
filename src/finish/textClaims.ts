import { foldDigits } from "../contacts.ts";
import { normalizeHandle } from "../evidence.ts";

/** What free text the model wrote may mention: creators in evidence, and product names from evidence. */
export interface TextRules {
  handles: Set<string>;
  /** Every caption, bio, transcript and observation in evidence, lowercased, for product names that hold a digit. */
  evidenceText: string;
}

const MENTION = /(?<![\w.@])@([A-Za-z0-9._]{2,24})/g;
/** A word that holds a digit: a number ("12", "1.2M", "50%") or a name ("GPT-4o", "Gen2"). */
const DIGIT_WORD = /(?<![\w@#])[A-Za-z0-9][A-Za-z0-9.,+%-]*/g;
/** Number words that state a quantity; "one" is mostly a pronoun ("no one", "one of"), so it counts only as below. */
const NUMBER_WORDS =
  /\b(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|dozens?|half)\b/gi;

/** "one" counting followers, views, posts, creators or videos, a word or two before the noun (round 4, B2). */
const ONE_COUNTS = /\bone(?:\s+[a-z-]+){0,2}?\s+(?:followers?|views?|posts?|creators?|videos?)\b/gi;

export interface TextProblems {
  figures: string[];
  handles: string[];
}

/** A word with a digit is a product name only when it also has a letter and the evidence text holds it; an id never is. */
function allowedDigitWord(word: string, rules: TextRules): boolean {
  const bare = word.replace(/[.,]+$/, "");
  return /[A-Za-z]/.test(bare) && !/^\d+(?:\.\d+)?[kKmMbBxX%]?$/.test(bare) && rules.evidenceText.includes(bare.toLowerCase());
}

/**
 * The figures and @handles in a text that the rules do not admit. Free text may hold no figure at all.
 * Digits of every script are read as digits first (round 4, B2).
 */
export function textProblems(raw: string, rules: TextRules): TextProblems {
  const text = foldDigits(raw.normalize("NFKC"));
  const withoutMentions = text.replace(MENTION, " ");
  const figures = [
    ...[...withoutMentions.matchAll(DIGIT_WORD)].map((m) => m[0]).filter((w) => /\d/.test(w) && !allowedDigitWord(w, rules)),
    ...[...withoutMentions.matchAll(NUMBER_WORDS)].map((m) => m[0]),
    ...[...withoutMentions.matchAll(ONE_COUNTS)].map((m) => m[0]),
  ];
  const handles = [...text.matchAll(MENTION)]
    .map((m) => normalizeHandle((m[1] ?? "").replace(/\.+$/, "")))
    .filter((h) => !rules.handles.has(h))
    .map((h) => `@${h}`);
  return { figures, handles };
}

/** A text's sentences, split after a full stop, question or exclamation mark. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Keeps only the sentences with no figure and no creator outside the evidence. */
export function keepSupportedSentences(text: string, rules: TextRules): string {
  return splitSentences(text)
    .filter((sentence) => {
      const p = textProblems(sentence, rules);
      return p.figures.length === 0 && p.handles.length === 0;
    })
    .join(" ");
}
