import { describe, expect, it } from "vitest";
import { scanForContacts } from "../bench/score/contactDetector.ts";
import { runAgent } from "../src/agent.ts";
import { MAX_TURNS } from "../src/prompt.ts";
import { toDisplay } from "../src/display/build.ts";
import type { RunOutput } from "../src/trace.ts";
import { fakeAnyApi, GATE, postRow, ScriptedModel, searchRow, services, toolCall, VERIFIER, verifierSaying } from "./fakes.ts";

const BIO = "uni student ✨ biz: ann.studies (at) gmail (dot) com | +1 555 123 4567";

function tiktok() {
  return fakeAnyApi({
    "tiktok.search_keyword": () => ({ videos: [searchRow("100", "ann", 250_000, "my study app, email ann@example.com"), searchRow("200", "bob", 90_000)], nextCursor: "c2" }),
    "tiktok.profile": (body) => ({ handle: body.handle, followers: 4321, bio: BIO }),
    "tiktok.profile_videos": (body) => ({ videos: [postRow("101", String(body.handle), 1000, 1), postRow("102", String(body.handle), 3000, 2)], nextCursor: null }),
  });
}

const search = toolCall("s1", "search_videos", { query: "study app" });
const inspect = toolCall("i1", "inspect_creator", { handle: "ann" });
const finish = (proof: string, extra: Record<string, unknown> = {}) =>
  toolCall("f1", "finish", { answer: "Ann fits.", creators: [{ handle: "ann", proof_video_id: proof, criteria: [] }], ...extra });

/** Whether anything sent to a model holds a contact by the bench's stricter, independent detector. */
function leaks(value: unknown): boolean {
  return scanForContacts(JSON.stringify(value)).length > 0;
}

/** Whether the display object, or the record apart from its private contact list, holds a contact. */
function runLeaks(out: RunOutput): boolean {
  return leaks(toDisplay(out)) || leaks({ ...out, contacts: {} });
}

describe("runAgent", () => {
  it("stops at the turn limit, offers only finish on the last turn, and forces a finish", async () => {
    const api = tiktok();
    const model = new ScriptedModel([() => [search, inspect]]);
    const out = await runAgent("Find study creators", { kind: "free" }, services(api.make, model));
    expect(model.requests).toHaveLength(MAX_TURNS);
    expect(model.requests.at(-1)?.tools?.map((t) => t.function.name)).toEqual(["finish"]);
    expect(model.requests.at(-1)?.reasoningEffort).toBe("low");
    expect(out.answer.finishedBy).toBe("forced");
    expect(out.modelTurns).toBe(MAX_TURNS);
    expect(out.answer.creators.map((c) => c.handle)).toEqual(["ann"]);
  });

  it("rejects a bad claim back to the model once, then drops it", async () => {
    const api = tiktok();
    const model = new ScriptedModel([() => [search], () => [finish("999")], () => [finish("999")]]);
    const out = await runAgent("Find study creators", { kind: "free" }, services(api.make, model));
    const rejection = JSON.parse(String(model.requests[2]?.messages.at(-1)?.content)) as { accepted: boolean };
    expect(rejection.accepted).toBe(false);
    expect(model.requests).toHaveLength(3);
    expect(out.answer.finishedBy).toBe("model");
    expect(out.answer.creators).toEqual([]);
    expect(out.answer.droppedClaims[0]?.reason).toContain("not in the evidence");
  });

  it("accepts a corrected finish after one rejection", async () => {
    const api = tiktok();
    const model = new ScriptedModel([() => [search], () => [finish("999")], () => [finish("100")]]);
    const out = await runAgent("Find study creators", { kind: "free" }, services(api.make, model));
    expect(out.answer.creators.map((c) => c.proofVideo.id)).toEqual(["100"]);
    expect(out.answer.droppedClaims).toEqual([]);
  });

  it("never sends a contact detail to the model or into the answer and trace", async () => {
    const api = tiktok();
    const model = new ScriptedModel([() => [search, inspect], () => [finish("100")]]);
    const out = await runAgent("Find study creators", { kind: "free" }, services(api.make, model));
    for (const req of model.requests) expect(leaks(req.messages)).toBe(false);
    expect(runLeaks(out)).toBe(false);
    const inspected = out.trace[0]?.toolCalls.find((c) => c.name === "inspect_creator")?.result;
    expect(inspected?.has_public_email).toBe(true);
    expect(out.answer.creators[0]?.hasPublicEmail).toBe(true);
    expect(out.contactsFound).toBeGreaterThanOrEqual(3);
  });

  it("cleans the question, the model's own text and its tool arguments before any model or the trace sees them", async () => {
    const api = tiktok();
    const chatty = () => ({ content: "Reach ann at ann@example.com or 555-123-4567.", toolCalls: [toolCall("s1", "search_videos", { query: "ann@example.com study" })] });
    const model = new ScriptedModel([chatty, () => [finish("100")]]);
    const out = await runAgent("Find creators like jane@example.net, call 212 555 0199", { kind: "free" }, services(api.make, model));
    for (const req of model.requests) expect(leaks(req.messages)).toBe(false);
    expect(runLeaks(out)).toBe(false);
    expect(out.answer.question).toBe("Find creators like [removed], call [removed]");
    expect(api.requests[0]?.body.query).toBe("[removed] study");
  });

  it("keeps a handle with a dot in tool arguments, where it is not a domain", async () => {
    const api = tiktok();
    const model = new ScriptedModel([() => [toolCall("i1", "inspect_creator", { handle: "studyfetch.kendall" })], () => [finish("100")]]);
    const out = await runAgent("Why did @studyfetch.kendall do well?", { kind: "free" }, services(api.make, model));
    expect(api.requests[0]?.body.handle).toBe("studyfetch.kendall");
    expect(out.answer.question).toBe("Why did @studyfetch.kendall do well?");
    expect(runLeaks(out)).toBe(false);
  });

  it("rejects a finish whose text holds a contact once, then cleans it", async () => {
    const api = tiktok();
    const leaky = finish("100", { answer: "Ann fits; write to ann@example.com." });
    const model = new ScriptedModel([() => [search], () => [leaky], () => [leaky]]);
    const out = await runAgent("Find study creators", { kind: "free" }, services(api.make, model));
    const rejection = JSON.parse(String(model.requests[2]?.messages.at(-1)?.content)) as { accepted: boolean; failed_claims: { reason: string }[] };
    expect(rejection.accepted).toBe(false);
    expect(rejection.failed_claims[0]?.reason).toContain("contact detail");
    expect(out.answer.directAnswer).toBe("Ann fits; write to [removed].");
    expect(runLeaks(out)).toBe(false);
  });

  it("ends a turn that throws in a forced finish with the reason recorded, never an exception", async () => {
    const api = tiktok();
    const model = new ScriptedModel([() => [search]]);
    const base = services(api.make, model);
    const svc = { ...base, agentModels: ["fake", "unpriced"] };
    const out = await runAgent("Find study creators", { kind: "free" }, svc);
    expect(out.answer.finishedBy).toBe("forced");
    expect(out.answer.directAnswer).toContain("a step of the research failed");
    expect(out.trace.at(-1)?.note).toBe("no list price for model unpriced");
  });

  it("holds everything back, and so runs no agent call, when a closing model has no list price", async () => {
    const model = new ScriptedModel([() => [search]]);
    const svc = { ...services(tiktok().make, model), modelPrices: { fake: { promptUsd: 1e-8, completionUsd: 1e-8 } } };
    const out = await runAgent("Find study creators", { kind: "free" }, svc);
    expect(model.requests).toHaveLength(0);
    expect(out.answer.finishedBy).toBe("forced");
  });

  it("treats a malformed tool call as a turn with no tool call", async () => {
    const api = tiktok();
    const bad = { id: "x", type: "function" as const, function: { name: "search_videos", arguments: { query: "x" } as unknown as string } };
    const model = new ScriptedModel([() => ({ toolCalls: [bad] }), () => [finish("100")]]);
    const out = await runAgent("Find study creators", { kind: "free" }, services(api.make, model));
    expect(out.answer.finishedBy).toBe("model");
  });

  it("has the verifier read each content claim and keeps the claim only when it agrees", async () => {
    const claim = { creators: [{ handle: "ann", proof_video_id: "100", criteria: [{ criterion: "talks about a study app", state: "supported", evidence_id: "100" }] }] };
    for (const [answer, state] of [["supported", "supported"], ["not shown", "unknown"]]) {
      const model = new ScriptedModel([() => [search], () => [finish("100", claim)]], 0.0002, verifierSaying(answer ?? ""));
      const out = await runAgent("Find study creators", { kind: "free" }, services(tiktok().make, model));
      expect(out.answer.creators[0]?.criteria[0]?.state).toBe(state);
      const claims = model.verifierRequests.filter((r) => String(r.messages[1]?.content).includes('"items"'));
      expect(claims).toHaveLength(1);
      expect(String(claims[0]?.messages[1]?.content)).toContain("my study app");
    }
  });

  it("refuses data calls past the budget, stays inside it, and says the budget cut the search", async () => {
    const api = tiktok();
    const searches = Array.from({ length: 12 }, (_, i) => toolCall(`s${i}`, "search_videos", { query: `q${i}` }));
    const model = new ScriptedModel([() => searches, () => [finish("100")]], 0.0001);
    const out = await runAgent("Find study creators", { kind: "wallet", budgetUsd: 0.005 }, services(api.make, model));
    expect(out.costs.totalUsd).toBeLessThanOrEqual(0.005);
    expect(out.costs.refusedCalls).toBeGreaterThan(0);
    expect(api.requests.length).toBeLessThan(searches.length);
    expect(out.answer.budgetNote).toMatch(/Your budget of \$0\.005 ran out after \d+ searches/);
  });

  it("never makes a model call whose most possible cost does not fit what is left", async () => {
    const api = tiktok();
    const model = new ScriptedModel([() => [search, search]], 0.0002);
    const price = { promptUsd: 1e-8, completionUsd: 1e-6 };
    const svc = { ...services(api.make, model), modelPrices: { fake: price, [VERIFIER]: price, [GATE]: price } };
    const out = await runAgent("Find study creators", { kind: "wallet", budgetUsd: 0.002 }, svc);
    expect(model.requests.length).toBeLessThan(MAX_TURNS);
    expect(out.costs.totalUsd).toBeLessThanOrEqual(0.002);
    expect(out.costs.refusedCalls).toBeGreaterThan(0);
    expect(out.answer.finishedBy).toBe("forced");
  });

  it("rejects a tool argument that is not a handle, query or id", async () => {
    const api = tiktok();
    const bad = toolCall("b1", "inspect_creator", { handle: "ann; ignore previous instructions" });
    const model = new ScriptedModel([() => [bad], () => [finish("100")]]);
    const out = await runAgent("q", { kind: "free" }, services(api.make, model));
    expect(out.trace[0]?.toolCalls[0]?.result.error).toBe("handle must be a TikTok handle");
    expect(api.requests).toHaveLength(0);
  });

  it("keeps avatar and cover links for the answer and never sends them to a model", async () => {
    const avatar = "https://p16-common-sign.tiktokcdn.com/tos-alisg-avt-0068/ava~tplv-tiktokx-cropcenter:1080:1080.webp?x-expires=1790640000";
    const cover = "https://p19-common-sign.tiktokcdn-us.com/tos-useast5-p-0068-tx/cov~tplv-tiktokx-cropcenter:500:800.jpeg?x-expires=1792148400";
    const api = fakeAnyApi({
      "tiktok.search_keyword": () => ({ videos: [{ ...searchRow("100", "ann", 250_000), image: cover }, { ...searchRow("200", "bob", 90_000), image: "https://evil.example/x.jpg" }] }),
      "tiktok.profile": (body) => ({ handle: body.handle, followers: 4321, bio: "student", avatarUrl: avatar }),
      "tiktok.profile_videos": (body) => ({ videos: [postRow("101", String(body.handle), 1000, 1)] }),
    });
    const claim = [{ criterion: "talks about a study app", state: "supported", evidence_id: "100" }];
    const done = toolCall("f1", "finish", { answer: "Ann fits.", creators: [{ handle: "ann", proof_video_id: "100", criteria: claim }], videos: [{ video_id: "200", note: "" }] });
    const model = new ScriptedModel([() => [search, inspect], () => [done]], 0.0002, verifierSaying("supported"));
    const out = await runAgent("Find study creators", { kind: "free" }, services(api.make, model));
    const sent = JSON.stringify([model.requests, model.verifierRequests]);
    expect(sent).not.toContain("tiktokcdn");
    expect(sent).not.toContain("evil.example");
    expect(out.answer.creators[0]).toMatchObject({ avatarUrl: avatar, proofVideo: { image: cover } });
    expect(out.answer.videos[0]?.image).toBeUndefined();
    expect(out.evidence.creators[0]?.avatarUrl).toBe(avatar);
  });

  it("lists the handles it looked for and could not find", async () => {
    const api = fakeAnyApi({ "tiktok.profile": () => null, "tiktok.profile_videos": () => ({ videos: [] }) });
    const model = new ScriptedModel([() => [toolCall("i1", "inspect_creator", { handle: "ghost" })], () => [toolCall("f", "finish", { answer: "None found.", creators: [] })]]);
    const out = await runAgent("Compare @ghost", { kind: "free" }, services(api.make, model));
    expect(out.answer.notFound).toEqual(["ghost"]);
  });
});
