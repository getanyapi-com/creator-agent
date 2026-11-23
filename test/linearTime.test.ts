import { describe, expect, it } from "vitest";
import { contactsIn } from "../bench/score/contactDetector.ts";
import { stripContacts } from "../src/contacts.ts";

/** The shapes that made the old patterns backtrack (round 4, F3): one letter, "a.", "@", digits with separators. */
function shapes(n: number): Record<string, string> {
  return { letter: "a".repeat(n), aDot: "a.".repeat(n / 2), at: "@".repeat(n), digits: "1".repeat(n), digitSpace: "1 ".repeat(n / 2), digitDash: "1-".repeat(n / 2), aAt: "a@".repeat(n / 2) };
}

/** The faster of two runs: another process on the machine can only add time (one whole-suite run once took 5.6 s while the machine ran other tests). */
function ms(f: () => unknown): number {
  const once = (): number => {
    const t = performance.now();
    f();
    return performance.now() - t;
  };
  return Math.min(once(), once());
}

/**
 * Each bound is twice the slowest time measured on 2026-11-21 after the fix: three runs of this file
 * alone, eight runs of the whole suite (whose parallel files slow it), and eight more while other
 * work held the machine's load average at 19 to 25 on 32 cores. Slowest, any shape: 32,000
 * characters, cleaner 89 ms ("1-" repeated), detector 5.0 ms; 1,000,000 characters, cleaner 1,688 ms
 * ("1-", under load), detector 88 ms ("a@", under load). Before the fix the cleaner took 194 ms on
 * 4,000 repeated letters and grew with the square of the length: about 12 s at 32,000 characters.
 */
const BOUND_MS: Record<number, { cleaner: number; detector: number }> = {
  32_000: { cleaner: 180, detector: 10 },
  1_000_000: { cleaner: 3_400, detector: 180 },
};

describe("the cleaner and the detector run in time proportional to their input (round 4, F3)", () => {
  // Compiling the patterns is not part of what is timed.
  stripContacts("warm @ up 555 0100", "user");
  contactsIn("warm @ up 555 0100");
  for (const [n, bound] of Object.entries(BOUND_MS).map(([k, v]) => [Number(k), v] as const)) {
    it(`cleans and scans ${n.toLocaleString("en-US")} characters of each shape within its bound`, () => {
      for (const [name, text] of Object.entries(shapes(n))) {
        const took = { name, cleaner: ms(() => stripContacts(text, "user")), detector: ms(() => contactsIn(text)) };
        expect({ ...took, within: took.cleaner < bound.cleaner && took.detector < bound.detector }).toMatchObject({ name, within: true });
      }
      // The test may take every shape at its bound, twice each (see `ms`), not vitest's default 5 s.
    }, 2 * Object.keys(shapes(1)).length * (bound.cleaner + bound.detector));
  }
});
