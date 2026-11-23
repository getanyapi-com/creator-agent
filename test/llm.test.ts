import { describe, expect, it } from "vitest";
import type { FetchFn } from "../src/anyapi.ts";
import { Budget } from "../src/budget.ts";
import { SurplusChat } from "../src/llm.ts";
import { callModel } from "../src/modelCall.ts";

function replies(answers: ((model: string) => Response | Error)[]) {
  const models: string[] = [];
  const fetchFn: FetchFn = async (_input, init) => {
    const model = (JSON.parse(String(init?.body)) as { model: string }).model;
    models.push(model);
    const answer = (answers[models.length - 1] ?? answers[answers.length - 1])?.(model);
    if (answer instanceof Error) throw answer;
    if (!answer) throw new Error("no scripted answer");
    return answer;
  };
  return { models, chat: new SurplusChat("k", fetchFn) };
}

const ok = () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "hi" } }], usage: { buyer_cost_micro: 5 } }));
const noSeller = () => new Response(JSON.stringify({ error: { code: "minimum_discount_not_met" } }), { status: 404 });
const timeout = () => new Error("The operation was aborted due to timeout");
const request = { models: ["a", "b"], messages: [{ role: "user" as const, content: "x" }], maxTokens: 10, timeoutMs: 1000 };
const bounds: Record<string, number> = { a: 0.001, b: 0.002 };
const bound = (m: string): number => bounds[m] ?? 0;

describe("callModel", () => {
  it("retries once when no seller meets the floor, then falls back to the next model", async () => {
    const { models, chat } = replies([noSeller, noSeller, ok]);
    const budget = new Budget(1);
    const res = await callModel(chat, budget, request, bound);
    expect(models).toEqual(["a", "a", "b"]);
    expect(res).toMatchObject({ model: "b", content: "hi", costUsd: 0.000005 });
    expect(budget.modelUsd).toBeCloseTo(0.000005, 12);
  });

  it("keeps a timed-out attempt's reservation as spent and moves to the next model", async () => {
    const { models, chat } = replies([timeout, ok]);
    const budget = new Budget(1);
    await callModel(chat, budget, request, bound);
    expect(models).toEqual(["a", "b"]);
    expect(budget.modelUsd).toBeCloseTo(0.001 + 0.000005, 12);
  });

  it("runs a second model only if its own worst case still fits", async () => {
    const { models, chat } = replies([timeout, ok]);
    const budget = new Budget(0.0025);
    await expect(callModel(chat, budget, request, bound)).rejects.toThrow(/budget has no room/);
    expect(models).toEqual(["a"]);
    expect(budget.spentUsd).toBeLessThanOrEqual(0.0025);
  });

  it("frees an attempt refused before it ran", async () => {
    const { chat } = replies([() => new Response("{}", { status: 429 }), ok]);
    const budget = new Budget(1);
    await callModel(chat, budget, request, bound);
    expect(budget.modelUsd).toBeCloseTo(0.000005, 12);
  });

  it("charges the bound when a completion does not state its cost", async () => {
    const { chat } = replies([() => new Response(JSON.stringify({ choices: [{ message: { content: "x" } }] }))]);
    const budget = new Budget(1);
    await callModel(chat, budget, { ...request, models: ["a"] }, bound);
    expect(budget.modelUsd).toBeCloseTo(0.001, 12);
  });
});

describe("callModel on a malformed completion", () => {
  const shaped = (message: unknown) => () => new Response(JSON.stringify({ choices: [{ message }], usage: { buyer_cost_micro: 1 } }));
  const one = async (answer: () => Response) => callModel(replies([answer]).chat, new Budget(1), { ...request, models: ["a"] }, bound);

  it("counts a malformed tool_calls as a turn with no tool call", async () => {
    expect((await one(shaped({ tool_calls: "finish" }))).toolCalls).toEqual([]);
    expect((await one(shaped({ tool_calls: [{ function: { name: "finish", arguments: { answer: "x" } } }] }))).toolCalls).toEqual([]);
    expect((await one(shaped({ tool_calls: [null] }))).toolCalls).toEqual([]);
    expect((await one(shaped({ content: 7 }))).content).toBe("");
    expect((await one(() => new Response(JSON.stringify({ choices: "x" })))).toolCalls).toEqual([]);
  });

  it("keeps well-formed tool calls", async () => {
    const calls = (await one(shaped({ tool_calls: [{ id: "c1", function: { name: "finish", arguments: "{}" } }] }))).toolCalls;
    expect(calls).toEqual([{ id: "c1", type: "function", function: { name: "finish", arguments: "{}" } }]);
  });
});
