import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent.ts";
import { toDisplay } from "../src/display/build.ts";
import type { ChatRequest } from "../src/llm.ts";
import { fakeAnyApi, ScriptedModel, searchRow, services, toolCall, verifierSaying } from "./fakes.ts";

const search = toolCall("s", "search_videos", { query: "pottery" });
const api = () => fakeAnyApi({ "tiktok.search_keyword": () => ({ videos: [searchRow("721", "amber", 340, "Glazing a pottery mug.")] }) });

/** A verifier that calls a sentence a limit when it says so, and any other sentence not shown by the evidence. */
function limitsOnly(req: ChatRequest): string {
  const body = JSON.parse(String(req.messages[1]?.content)) as { sentences?: { id: string; text: string }[] };
  if (!body.sentences) return '{"verdicts":[]}';
  return JSON.stringify({ sentences: body.sentences.map((s) => ({ id: s.id, why: "test", kind: /could not/.test(s.text) ? "limit" : "not_shown", names: [] })) });
}

describe("the limits note is verified like the answer (round 4, F4)", () => {
  it("drops a claim about a creator the evidence does not show, and keeps a statement about a limit, labelled", async () => {
    const note = "@amber is a licensed surgeon who cures eczema. I could not check comments.";
    const model = new ScriptedModel([() => [search], () => [toolCall("f", "finish", { answer: "Pottery creators.", videos: [{ video_id: "721" }], limits_note: note })]], 0.000001, limitsOnly);
    const run = await runAgent("Find pottery creators", { kind: "free" }, services(api().make, model));
    expect(JSON.stringify(model.verifierRequests)).toContain("licensed surgeon");
    const display = toDisplay(run);
    expect(display.limits).toBe("I could not check comments.");
    expect(display.limitsSentences).toEqual([{ text: "I could not check comments.", label: "limit" }]);
    expect(run.answer.droppedClaims.some((d) => d.claim.includes("licensed surgeon"))).toBe(true);
  });
});

describe("an answer with nothing left is a failure, said plainly (round 4, F5)", () => {
  it("replaces an emptied answer with the code's own failure, with what was spent", async () => {
    const model = new ScriptedModel([() => [toolCall("f", "finish", { answer: "The creator is a licensed surgeon." })]], 0.000001, verifierSaying("not shown", "not_shown"));
    const run = await runAgent("Find pottery creators", { kind: "free" }, services(fakeAnyApi({}).make, model));
    const display = toDisplay(run);
    expect(display.finishedBy).toBe("unconfirmed");
    expect(display.answer).toHaveLength(2);
    expect(display.answer[0]).toEqual({ text: "The research finished, but nothing it found could be confirmed, so there is no answer to show.", label: "limit" });
    expect(display.answer[1]?.text).toMatch(/^It spent \$0\.\d+ of the \$0\.10 limit\.$/);
    expect(display.steps.at(-1)).toMatchObject({ label: "Nothing it found could be confirmed", failed: true });
    expect(display.steps.map((s) => s.label)).toContain("Wrote the answer");
  });

  it("leaves an answer that keeps anything alone", async () => {
    const model = new ScriptedModel([() => [search], () => [toolCall("f", "finish", { answer: "", videos: [{ video_id: "721" }] })]], 0.000001);
    const run = await runAgent("Find pottery creators", { kind: "free" }, services(api().make, model));
    expect(run.answer.finishedBy).toBe("model");
  });
});
