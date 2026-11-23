import { describe, expect, it } from "vitest";
import { AnyApiClient, trustedCost, type FetchFn } from "../src/anyapi.ts";
import { Budget, meteredSpender } from "../src/budget.ts";
import { ENDPOINTS } from "../src/endpoints.ts";
import { callModel } from "../src/modelCall.ts";
import { readPublishedPrices, tablePrices } from "../src/prices.ts";
import { fakeAnyApi } from "./fakes.ts";

describe("Budget", () => {
  it("refuses a call that would pass the limit and counts the refusal", () => {
    const budget = new Budget(0.001);
    expect(budget.reserve(0.0006)).toBe(true);
    expect(budget.reserve(0.0006)).toBe(false);
    expect(budget.refusedCalls).toBe(1);
    expect(budget.spentUsd).toBeCloseTo(0.0006, 10);
  });

  it("settles a call at the billed cost", () => {
    const budget = new Budget(0.1);
    budget.reserve(0.0006);
    budget.settle(0.0006, 0.0003);
    expect(budget.dataUsd).toBeCloseTo(0.0003, 10);
  });

  it("tells what is reserved for calls not yet settled apart from what was billed", () => {
    const budget = new Budget(0.1);
    budget.reserve(0.0006);
    budget.reserve(0.002, "model");
    expect(budget.unsettledUsd("data")).toBeCloseTo(0.0006, 12);
    expect(budget.unsettledUsd("model")).toBeCloseTo(0.002, 12);
    budget.settle(0.0006, 0.0003);
    budget.settle(0.002, 0, "model");
    expect(budget.unsettledUsd("data")).toBeCloseTo(0, 12);
    expect(budget.unsettledUsd("model")).toBeCloseTo(0, 12);
    expect(budget.dataUsd).toBeCloseTo(0.0003, 12);
  });

  it("holds the model reserve back from data calls", () => {
    const budget = new Budget(0.002);
    budget.setModelReserve(0.0015);
    expect(budget.reserve(0.0006)).toBe(false);
    budget.setModelReserve(0);
    expect(budget.reserve(0.0006)).toBe(true);
  });

  it("keeps the closing hold from data and agent calls even when the next-call hold is released; only closing calls use it", () => {
    const budget = new Budget(0.002);
    budget.holdForClosing(0.0015);
    budget.setModelReserve(0);
    expect(budget.reserve(0.0006, "model")).toBe(false);
    expect(budget.reserve(0.0006, "data")).toBe(false);
    expect(budget.reserve(0.0015, "model", { closing: true })).toBe(true);
  });

  it("books what any model call bills above its hold as house cost, and meters each step's share (round 4, F6)", () => {
    const budget = new Budget(0.01);
    const seen: number[] = [];
    const step = meteredSpender(budget, (usd) => seen.push(usd));
    step.reserve(0.002, "model");
    step.settle(0.002, 0.005, "model");
    expect(budget.modelUsd).toBeCloseTo(0.002, 12);
    expect(budget.houseUsd).toBeCloseTo(0.003, 12);
    expect(seen.reduce((a, b) => a + b, 0)).toBeCloseTo(0.002, 12);
  });
});

describe("settling what services report (round 4, F6)", () => {
  it("settles a data call's negative, non-number or over-price cost at the reserved price, and keeps zero at zero", async () => {
    for (const [reported, settled] of [[-0.15, 0.0006], [0.15, 0.0006], [0, 0], [0.0003, 0.0003]] as const) {
      const budget = new Budget(0.1);
      await fakeAnyApi({ "tiktok.search_keyword": () => ({ videos: [] }) }, reported).make(budget).run("tiktok.search_keyword", { query: "x" });
      expect(budget.dataUsd).toBeCloseTo(settled, 12);
    }
    expect(trustedCost(Number.NaN, 0.0006, false)).toBe(0.0006);
    expect(trustedCost(null, 0.0006, true)).toBe(0);
  });

  it("settles a model bill that is negative or not a number at its hold, and one above its hold at the hold plus house cost", async () => {
    const request = { models: ["m"], messages: [{ role: "user" as const, content: "x" }], maxTokens: 10, timeoutMs: 1000 };
    for (const [bill, model, house] of [[-1, 0.001, 0], [Number.NaN, 0.001, 0], [0.003, 0.001, 0.002], [0.0004, 0.0004, 0]] as const) {
      const budget = new Budget(0.01);
      const res = await callModel({ complete: async () => ({ content: "ok", toolCalls: [], costUsd: bill, finishReason: "stop" }) }, budget, request, () => 0.001);
      expect([budget.modelUsd, budget.houseUsd, res.chargedUsd]).toEqual([model, house, model].map((n) => expect.closeTo(n, 12)));
    }
  });
});

describe("AnyApiClient", () => {
  it("prices each call before it runs and never sends a refused call", async () => {
    const api = fakeAnyApi({ "tiktok.search_keyword": () => ({ videos: [] }) });
    const budget = new Budget(ENDPOINTS["tiktok.search_keyword"].priceUsd * 2);
    const client = api.make(budget);
    const results = await Promise.all([1, 2, 3].map(() => client.run("tiktok.search_keyword", { query: "x" })));
    expect(results.map((r) => r.ok)).toEqual([true, true, false]);
    expect(api.requests).toHaveLength(2);
    expect(budget.spentUsd).toBeLessThanOrEqual(budget.limitUsd);
  });

  it("pins the source with fallbacks off", async () => {
    const api = fakeAnyApi({});
    const client = api.make(new Budget(1));
    await client.run("tiktok.profile", { handle: "a" });
    await client.run("tiktok.video_transcript", { url: "u" });
    expect(api.requests[0]?.body).toMatchObject({ source: ["anonymous-bison-cb2f8f3c"], allowFallbacks: false });
    expect(api.requests[1]?.body).toMatchObject({ source: ["anonymous-flamingo"], allowFallbacks: false });
  });

  const failing = (answer: () => Response | Promise<Response>): FetchFn => async () => answer();
  const PRICE = ENDPOINTS["tiktok.profile"].priceUsd;
  const runOnce = async (fetchFn: FetchFn) => {
    const budget = new Budget(1);
    await new AnyApiClient("k", budget, tablePrices(), fetchFn).run("tiktok.profile", { handle: "a" });
    return budget;
  };

  it("keeps the reservation as spent when the response is lost, times out or fails after it was sent", async () => {
    const lost = await runOnce(async () => {
      throw new Error("The operation was aborted due to timeout");
    });
    expect(lost.dataUsd).toBeCloseTo(PRICE, 10);
    expect((await runOnce(failing(() => new Response("bad gateway", { status: 502 })))).dataUsd).toBeCloseTo(PRICE, 10);
    expect((await runOnce(failing(() => new Response("{not json", { status: 200 })))).dataUsd).toBeCloseTo(PRICE, 10);
  });

  it("frees the reservation only for a refusal that proves nothing ran", async () => {
    for (const status of [400, 401, 402, 404, 429]) {
      const budget = await runOnce(failing(() => new Response(JSON.stringify({ error: "no", code: "x" }), { status })));
      expect(budget.dataUsd).toBe(0);
    }
  });

  it("settles a failed call at the cost the service says it charged", async () => {
    const body = { error: "upstream failed", code: "upstream_error", payment: { rail: "wallet", settlementState: "charged_undelivered", costUsd: 0.0002 } };
    const budget = await runOnce(failing(() => new Response(JSON.stringify(body), { status: 502 })));
    expect(budget.dataUsd).toBeCloseTo(0.0002, 10);
  });

  it("reserves each call at the published price it was given, not the table's", async () => {
    const prices = { ...tablePrices(), "tiktok.profile": 0.00044 };
    const budget = new Budget(0.0008);
    const client = new AnyApiClient("k", budget, prices, async () => new Response("x", { status: 502 }));
    await client.run("tiktok.profile", { handle: "a" });
    expect(budget.dataUsd).toBeCloseTo(0.00044, 10);
    expect((await client.run("tiktok.profile", { handle: "b" })).ok).toBe(false);
    expect(budget.refusedCalls).toBe(1);
  });
});

describe("readPublishedPrices", () => {
  const catalog = (shift: number) => async (input: string | URL | Request) => {
    const endpoint = String(input).split("/v1/apis/")[1] as keyof typeof ENDPOINTS;
    const spec = ENDPOINTS[endpoint];
    const lanes = [{ source: { id: spec.source }, pricing: { maxUsd: spec.priceUsd + shift } }];
    return new Response(JSON.stringify({ lanes }), { status: 200 });
  };

  it("returns the published prices when they match the table within rounding", async () => {
    const prices = await readPublishedPrices("k", catalog(0.00004));
    expect(prices["tiktok.profile"]).toBeCloseTo(ENDPOINTS["tiktok.profile"].priceUsd + 0.00004, 10);
  });

  it("fails loudly when a published price differs by more than rounding", async () => {
    await expect(readPublishedPrices("k", catalog(0.0002))).rejects.toThrow(/differ from the table/);
  });
});
