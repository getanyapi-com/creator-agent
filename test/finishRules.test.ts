import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent.ts";
import { closingHoldUsd } from "../src/closing.ts";
import { toDisplay } from "../src/display/build.ts";
import { NARRATIVE_UNCHECKED } from "../src/finish/narrative.ts";
import { textProblems } from "../src/finish/textClaims.ts";
import type { ChatRequest } from "../src/llm.ts";
import { MAX_TURNS } from "../src/prompt.ts";
import { fakeAnyApi, GATE, ScriptedModel, searchRow, services, toolCall, VERIFIER } from "./fakes.ts";

const api = () => fakeAnyApi({ "tiktok.search_keyword": () => ({ videos: [searchRow("721", "amber", 340, "A ceramic mug being glazed.")], nextCursor: null }) });
const search = toolCall("s", "search_videos", { query: "ceramic mugs" });
const finish = (args: Record<string, unknown>) => toolCall("f", "finish", args);

/** A verifier that gives each sentence the kind and names in `kinds` (by sentence text) and each claim `claim`. */
function verifier(kinds: Record<string, { kind: string; names?: string[] }>, claim = "supported"): (req: ChatRequest) => string {
  return (req) => {
    const body = JSON.parse(String(req.messages[1]?.content)) as { items?: { id: string }[]; sentences?: { id: string; text: string }[] };
    if (body.sentences) return JSON.stringify({ sentences: body.sentences.map((s) => ({ id: s.id, why: "t", kind: kinds[s.text]?.kind ?? "shown", names: kinds[s.text]?.names ?? [] })) });
    return JSON.stringify({ verdicts: (body.items ?? []).map((i) => ({ id: i.id, why: "t", answer: claim })) });
  };
}

async function answer(args: Record<string, unknown>, reply: (req: ChatRequest) => string, question = "Find pottery creators") {
  const model = new ScriptedModel([() => [search], () => [finish(args)]], 0.0002, reply);
  return runAgent(question, { kind: "free" }, services(api().make, model));
}

describe("narrative text is verified sentence by sentence (round 4, B1)", () => {
  const unproven = { answer: "@amber is a licensed surgeon who cures eczema.", videos: [{ video_id: "721", note: "This video proves the cream cures eczema." }], assumptions: ["Marlow Finch is a dermatologist on TikTok."] };

  it("drops a sentence the evidence does not show, and one naming a person without an @handle", async () => {
    const out = await answer(unproven, verifier({ "@amber is a licensed surgeon who cures eczema.": { kind: "not_shown" }, "This video proves the cream cures eczema.": { kind: "not_shown" }, "Marlow Finch is a dermatologist on TikTok.": { kind: "assumption", names: ["Marlow Finch"] } }));
    expect(out.answer.directAnswer).toBe("");
    expect(out.answer.videos[0]?.note).toBeNull();
    expect(out.answer.assumptions).toEqual([]);
    expect(out.answer.droppedClaims.map((d) => d.reason)).toEqual(expect.arrayContaining([expect.stringContaining("evidence does not show"), expect.stringContaining("Marlow Finch without an @handle")]));
  });

  it("keeps a name the question gives, and statements about limits and assumptions, labelled as such", async () => {
    const args = { answer: "No video names the app. I read a mug video as pottery.", assumptions: ["Marlow Finch is a dermatologist on TikTok."] };
    const kinds = { "No video names the app.": { kind: "limit" }, "I read a mug video as pottery.": { kind: "assumption" }, "Marlow Finch is a dermatologist on TikTok.": { kind: "assumption", names: ["Marlow Finch"] } };
    const out = await answer(args, verifier(kinds), "Is Marlow Finch on TikTok?");
    expect(out.answer.assumptions).toEqual(["Marlow Finch is a dermatologist on TikTok."]);
    expect(toDisplay(out).answer).toEqual([
      { text: "No video names the app.", label: "limit" },
      { text: "I read a mug video as pottery.", label: "assumption" },
    ]);
  });

  it("says the text could not be checked, and keeps none of it, when the verifier's reply cannot be read", async () => {
    const out = await answer(unproven, () => "not json");
    expect(out.answer.directAnswer).toBe(NARRATIVE_UNCHECKED);
    expect(out.answer.assumptions).toEqual([]);
  });
});

describe("quantities in free text (round 4, B2)", () => {
  const rules = { handles: new Set(["amber"]), evidenceText: "a ceramic mug being glazed. #721" };
  it.each(["@amber has ٣٤٠٠ followers.", "@amber has 721 followers.", "@amber has one follower.", "Only one of her videos broke out."])("finds a figure in %j", (text) => {
    expect(textProblems(text, rules).figures.length).toBeGreaterThan(0);
  });
  it.each(["No one here is sponsored.", "This one makes mugs."])("finds none in %j", (text) => {
    expect(textProblems(text, rules).figures).toEqual([]);
  });
});

describe("intake, holds and finishes", () => {
  it("never throws on a question it cannot decode (round 4, B4)", async () => {
    const model = new ScriptedModel([() => [finish({ answer: "Done." })]]);
    const out = await runAgent("Find creators mentioning &#x110000;", { kind: "free" }, services(api().make, model));
    expect(out.answer.question).toBe("Find creators mentioning �");
  });

  it("keeps the closing calls' hold from every agent call (round 4, B5)", async () => {
    const base = services(api().make, new ScriptedModel([() => [search]]));
    const hold = closingHoldUsd(base.modelPrices, VERIFIER, GATE);
    const model = new ScriptedModel([() => [search]]);
    const out = await runAgent("q", { kind: "wallet", budgetUsd: hold * 1.0001 }, { ...base, llm: model });
    expect(model.requests).toHaveLength(0);
    expect(out.answer.finishedBy).toBe("forced");
    expect(model.gateRequests).toHaveLength(1);
  });

  it("rejects an empty finish like any failed one, and forces a finish when it is the last word (round 4, B6)", async () => {
    const recovered = new ScriptedModel([() => [search], () => [finish({})], () => [finish({ answer: "A mug glazer." })]]);
    const ok = await runAgent("q", { kind: "free" }, services(api().make, recovered));
    expect(ok.answer).toMatchObject({ finishedBy: "model", directAnswer: "A mug glazer." });
    const stuck = new ScriptedModel([() => [finish({})]]);
    const out = await runAgent("q", { kind: "free" }, services(api().make, stuck));
    expect(stuck.requests).toHaveLength(MAX_TURNS);
    expect(out.answer.finishedBy).toBe("forced");
  });
});

describe("verifier parsing (round 4, B7)", () => {
  const claim = (state: string) => ({ answer: "A mug.", creators: [{ handle: "amber", proof_video_id: "721", criteria: [{ criterion: "shows pottery", state, evidence_id: "721" }] }], checks: [{ kind: "proof_views_at_least", value: 300, from: "question" }] });
  const reply = (verdicts: string) => (req: ChatRequest) => (String(req.messages[1]?.content).includes('"sentences"') ? verifier({})(req) : verdicts);

  it("uses no verdict at all when any entry is malformed", async () => {
    const out = await answer(claim("supported"), reply('{"verdicts":[{"id":"c0.0","answer":"supported"},null]}'));
    expect(out.answer.creators[0]?.criteria[0]?.state).toBe("unknown");
  });

  it("makes a supported claim unknown when the verifier contradicts it, and leaves the code's own checks alone", async () => {
    const out = await answer(claim("supported"), verifier({}, "contradicted"));
    const [content, check] = out.answer.creators[0]?.criteria ?? [];
    expect(content?.state).toBe("unknown");
    expect(check).toMatchObject({ state: "supported", check: { kind: "proof_views_at_least" } });
  });
});
