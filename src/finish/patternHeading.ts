import { CODE_HEADINGS } from "./sections.ts";

/**
 * The label of a pattern the model wrote as "Label: why it works" (or with a spaced dash): the words
 * before the first colon or spaced dash, when they end no sentence. A pattern with no such label gets
 * the code's heading. Like a section heading, the label names the pattern and states no fact, so a
 * pattern whose explanation the evidence does not show keeps its videos under it (round 5).
 */
export function patternHeading(pattern: string): string {
  const m = /^([^:.!?]+?)\s*(?::|\s[—–-])\s/.exec(pattern);
  return m?.[1]?.trim() || CODE_HEADINGS.pattern;
}
