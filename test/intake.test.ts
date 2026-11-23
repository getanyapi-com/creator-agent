import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent.ts";
import { Budget } from "../src/budget.ts";
import { toDisplay } from "../src/display/build.ts";
import { acceptProposals } from "../src/intake/accept.ts";
import { readQuestionChecks } from "../src/intake/intake.ts";
import { daysValue, followerValue, viewsValue, wantedValue } from "../src/intake/quoteValues.ts";
import { regionValue } from "../src/intake/region.ts";
import { DAY, fakeAnyApi, NOW_SEC, postRow, ScriptedModel, searchRow, services, toolCall, VERIFIER } from "./fakes.ts";

const Q = "Find 10 US creators with under 10,000 followers who posted in the last 30 days and got a video over 100,000 views.";

describe("what the code reads from a quote (round 4, F1)", () => {
  it("reads figures, windows, countries and counts the way people write them", () => {
    expect(followerValue("under 10,000 followers", "at_most")).toBe(10_000);
    expect(followerValue("sub-10K", "at_most")).toBe(10_000);
    expect(followerValue("under 20k followers", "at_most")).toBe(20_000);
    expect(followerValue("over 1.5k followers", "at_least")).toBe(1_500);
    expect(viewsValue("a video over 100,000 views")).toBe(100_000);
    expect(daysValue("in the last 30 days")).toBe(30);
    expect(daysValue("this month")).toBe(30);
    expect(daysValue("this week")).toBe(7);
    expect(daysValue("past two weeks")).toBe(14);
    expect(regionValue("US creators")).toBe("US");
    expect(regionValue("in the UK")).toBe("GB");
    expect(regionValue("creators in Germany")).toBe("DE");
    expect(wantedValue("Find 10 US creators")).toBe(10);
    expect(wantedValue("five creators")).toBe(5);
  });

  it("reads no limit from a target, a wrong direction, a wrong noun or a lower-case word", () => {
    expect(followerValue("around 1,500 followers", "at_most")).toBeNull();
    expect(followerValue("around 1,500 followers", "at_least")).toBeNull();
    expect(followerValue("with ~2k followers", "at_most")).toBeNull();
    expect(followerValue("under 10,000 followers", "at_least")).toBeNull();
    expect(followerValue("over 100,000 views", "at_least")).toBeNull();
    expect(viewsValue("under 10,000 followers")).toBeNull();
    expect(daysValue("recently")).toBeNull();
    expect(regionValue("help us find creators")).toBeNull();
  });
});

describe("accepting proposed checks (round 4, F1)", () => {
  it("accepts a check whose quote is in the question and states the proposed value", () => {
    const got = acceptProposals(Q, {
      checks: [
        { kind: "followers_at_most", value: 10000, quote: "under 10,000 followers" },
        { kind: "proof_views_at_least", value: "100000", quote: "over 100,000 views" },
        { kind: "proof_posted_within_days", value: 30, quote: "in the last 30 days" },
        { kind: "proof_region", value: "us", quote: "US creators" },
      ],
      wanted: { value: 10, quote: "Find 10 US creators" },
    });
    expect(got.checks).toEqual([
      { kind: "followers_at_most", value: 10_000, from: "question" },
      { kind: "proof_views_at_least", value: 100_000, from: "question" },
      { kind: "proof_posted_within_days", value: 30, from: "question" },
      { kind: "proof_region", value: "US", from: "question" },
    ]);
    expect(got.wanted).toBe(10);
    expect(got.rejected).toEqual([]);
  });

  it("refuses a fabricated check, a quote not in the question, a value that differs from its quote and an approximate target", () => {
    const got = acceptProposals("Find me 10 NYU creators with around 1,500 followers.", {
      checks: [
        { kind: "proof_views_at_least", value: 100000 },
        { kind: "proof_region", value: "US", quote: "US creators" },
        { kind: "followers_at_most", value: 50000, quote: "1,500 followers" },
        { kind: "followers_at_least", value: 1500, quote: "around 1,500 followers" },
      ],
      wanted: { value: 12, quote: "10 NYU creators" },
    });
    expect(got.checks).toEqual([]);
    expect(got.wanted).toBeNull();
    expect(got.rejected.map((r) => r.why)).toEqual([
      "no quote from the question",
      "the quote is not in the question",
      "the quote states no single value of this kind",
      "the quote states no single value of this kind",
      "the quote does not say this number",
    ]);
  });

  it("refuses a value the quote does not state", () => {
    const got = acceptProposals(Q, { checks: [{ kind: "followers_at_most", value: 50000, quote: "under 10,000 followers" }] });
    expect(got.rejected[0]?.why).toBe("the quote says 10000, not 50000");
  });
});

const model = (intake: string | (() => never)) =>
  new ScriptedModel([() => [toolCall("f", "finish", { answer: "Done." })]], 0.000001, undefined, undefined, () => (typeof intake === "string" ? intake : intake()));
const step = () => ({ llm: model('{"checks":[]}'), budget: new Budget(0.1), prices: services(fakeAnyApi({}).make, model("")).modelPrices, model: VERIFIER });

describe("the intake step (round 4, F1)", () => {
  it("is read when the model proposes nothing, failed when it cannot be read or none of its proposals hold", async () => {
    const none = await readQuestionChecks({ ...step(), llm: model('{"checks":[],"wanted":null}') }, Q, 0);
    expect(none).toMatchObject({ status: "read", checks: [] });
    const garbage = await readQuestionChecks({ ...step(), llm: model("not json") }, Q, 0);
    expect(garbage.status).toBe("failed");
    const thrown = await readQuestionChecks({ ...step(), llm: model(() => { throw new Error("down"); }) }, Q, 0);
    expect(thrown.status).toBe("failed");
    const allBad = await readQuestionChecks({ ...step(), llm: model('{"checks":[{"kind":"followers_at_most","value":5,"quote":"nowhere"}]}') }, Q, 0);
    expect(allBad).toMatchObject({ status: "failed", rejected: [{ why: "the quote is not in the question" }] });
  });
});

/** The review's case: a GB creator with 50,000 followers, a 20-view proof video posted 100 days ago. */
function reviewCase(intakeReply?: string) {
  const bad = { ...searchRow("721", "amber", 20, "A pottery mug."), region: "GB", createdUtc: NOW_SEC - 100 * DAY };
  const api = fakeAnyApi({
    "tiktok.search_keyword": () => ({ videos: [bad] }),
    "tiktok.profile": () => ({ handle: "amber", followers: 50000, bio: "Pottery." }),
    "tiktok.profile_videos": () => ({ videos: [bad, postRow("722", "amber", 30, 2)] }),
  });
  return (checks: unknown[]) => {
    const script = [() => [toolCall("s", "search_videos", { query: "pottery" }), toolCall("i", "inspect_creator", { handle: "amber" })], () => [toolCall("f", "finish", { answer: "A pottery creator.", creators: [{ handle: "amber", proof_video_id: "721", criteria: [] }], checks })]];
    const llm = new ScriptedModel(script, 0.000001, undefined, undefined, intakeReply === undefined ? undefined : () => intakeReply);
    return { llm, api, run: () => runAgent(Q, { kind: "free" }, services(api.make, llm)) };
  };
}

describe("the question's checks are fixed for the run (round 4, F1)", () => {
  it("leaves out a creator who misses them whether finish omits, declares or loosens them", async () => {
    const loose = [
      { kind: "followers_at_most", value: 50000, from: "question" },
      { kind: "proof_views_at_least", value: 10, from: "question" },
      { kind: "proof_posted_within_days", value: 365, from: "assumption" },
      { kind: "proof_region", value: "GB", from: "question" },
    ];
    for (const checks of [[], loose]) {
      const out = await reviewCase()(checks).run();
      expect(out.answer.creators).toEqual([]);
      expect(out.intake.status).toBe("read");
      expect(toDisplay(out).criteriaLine).toMatch(/^Checked on every creator: at most 10,000 followers; proof video at least 100,000 views; proof video posted in the last 30 days; proof video region United States\. Left out 1 creator/);
    }
  });

  it("has the tools apply them without being asked: no posts bought for a creator outside the follower limit, no profile for a row that misses views", async () => {
    const { api, run } = reviewCase()([]);
    const out = await run();
    expect(api.requests.map((r) => r.endpoint)).toEqual(["tiktok.search_keyword", "tiktok.profile"]);
    const inspected = out.trace[0]?.toolCalls[1]?.result;
    expect(inspected).toMatchObject({ followers: 50000 });
    expect(String(inspected?.ruled_out)).toContain("at most 10,000 followers");
    expect(out.trace[0]?.toolCalls[0]?.result).toMatchObject({ left_out_by_checks: { views: 1 } });
  });

  it("falls back to the checks finish declares when the intake step fails, and says so", async () => {
    const out = await reviewCase("not json")([{ kind: "followers_at_most", value: 10000, from: "question" }]).run();
    expect(out.intake.status).toBe("failed");
    expect(out.answer.creators).toEqual([]);
    expect(out.answer.criteriaLine).toMatch(/^Checked on every creator, as the agent read the question: at most 10,000 followers\./);
  });

  it("ignores a looser follower check the model passes to a tool", async () => {
    const { api } = reviewCase()([]);
    const llm = new ScriptedModel([() => [toolCall("i", "inspect_creator", { handle: "amber", checks: [{ kind: "followers_at_most", value: 60000, from: "question" }] })], () => [toolCall("f", "finish", { answer: "None." })]], 0.000001);
    const out = await runAgent(Q, { kind: "free" }, services(api.make, llm));
    expect(String(out.trace[0]?.toolCalls[0]?.result.ruled_out)).toContain("at most 10,000 followers");
    expect(api.requests.map((r) => r.endpoint)).toEqual(["tiktok.profile"]);
  });

  it("applies them to a forced finish too", async () => {
    const api = fakeAnyApi({
      "tiktok.profile": () => ({ handle: "amber", followers: 5000, bio: "Pottery." }),
      "tiktok.profile_videos": () => ({ videos: [{ ...postRow("722", "amber", 30, 2), region: "US" }] }),
    });
    const llm = new ScriptedModel([() => [toolCall("i", "inspect_creator", { handle: "amber" })], () => []], 0.000001);
    const out = await runAgent(Q, { kind: "free" }, services(api.make, llm));
    expect(out.answer.finishedBy).toBe("forced");
    expect(out.answer.creators).toEqual([]);
    expect(out.answer.excluded).toMatchObject({ count: 1, byCheck: [{ check: "proof video at least 100,000 views", count: 1 }] });
    expect(out.answer.directAnswer).toContain("checked only against the limits the question states");
  });
});

describe("the prompt says nothing about limits when the question states none (q12, round 4)", () => {
  it("adds no line for a question with no limit, and the limits when there are some", async () => {
    const { userPrompt } = await import("../src/prompt.ts");
    expect(userPrompt("Find creators for my app.", { kind: "free" }, 0.1, { status: "read", checks: [], wanted: null, rejected: [], call: null })).not.toMatch(/limit|assumption/i);
    expect(userPrompt("q", { kind: "free" }, 0.1, { status: "read", checks: [{ kind: "followers_at_most", value: 10000, from: "question" }], wanted: 10, rejected: [], call: null })).toMatch(/at most 10,000 followers\. It asks for this many creators: 10\.$/);
  });
});
