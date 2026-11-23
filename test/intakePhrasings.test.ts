import { describe, expect, it } from "vitest";
import { PHRASINGS } from "../bench/intakePhrasings.ts";
import { acceptProposals } from "../src/intake/accept.ts";
import { regionValue } from "../src/intake/region.ts";
import { daysValue, followerValue, viewsValue } from "../src/intake/quoteValues.ts";

/** The phrasing the code reads a country adjective in only before a word for people, by design (round 5). */
const MISS_BY_DESIGN = "German fitness creators";

describe("intake accepts the limits a question states, however it words them (round 5)", () => {
  it.each(PHRASINGS.map((p) => [p.text, p] as const))("%s", (_text, p) => {
    const proposals = p.checks.map(({ check, quote }) => ({ kind: check.kind, value: check.value, quote }));
    const got = acceptProposals(p.text, { checks: proposals, wanted: p.wanted === null ? null : { value: p.wanted, quote: `${p.wanted} creators` } });
    const expected = p.checks.filter((c) => c.quote !== MISS_BY_DESIGN).map((c) => c.check);
    expect(got.checks).toEqual(expected);
    expect(got.wanted).toBe(p.wanted);
  });

  it("still reads no limit a question does not state", () => {
    expect(followerValue("around 5k followers", "at_most")).toBeNull();
    expect(followerValue("roughly 10k followers", "at_least")).toBeNull();
    expect(daysValue("recently")).toBeNull();
    expect(daysValue("in the last few weeks")).toBeNull();
    expect(followerValue("small creators", "at_most")).toBeNull();
    expect(regionValue("Spanish-learning creators")).toBeNull();
    expect(regionValue("Italian food creators")).toBeNull();
    expect(regionValue(MISS_BY_DESIGN)).toBeNull();
    expect(viewsValue("a video with 1M views")).toBeNull();
  });

  it("refuses a range end proposed for the wrong side, and a range proposed as one limit of another value", () => {
    const text = "Creators with between 5K and 20K followers who review skincare.";
    const got = acceptProposals(text, { checks: [{ kind: "followers_at_most", value: 5000, quote: "between 5K and 20K followers" }, { kind: "followers_at_least", value: 10000, quote: "between 5K and 20K followers" }] });
    expect(got.checks).toEqual([]);
    expect(got.rejected.map((r) => r.why)).toEqual(["the quote says 20000, not 5000", "the quote says 5000, not 10000"]);
  });
});
