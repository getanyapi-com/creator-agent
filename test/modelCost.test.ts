import { describe, expect, it } from "vitest";
import { callBoundUsd } from "../src/modelCost.ts";
import { cleanText } from "../src/untrusted.ts";

describe("callBoundUsd", () => {
  it("is above what a real call billed (glm-5.3-flash, 90,023-character prompt, $0.000133 on 2026-11-20)", () => {
    const prices = { "glm-5.3-flash": { promptUsd: 1.2e-7, completionUsd: 4.75e-7 } };
    const messages = [{ role: "user" as const, content: "x".repeat(90_023) }];
    expect(callBoundUsd(prices, { models: ["glm-5.3-flash"], messages, maxTokens: 2000 })).toBeGreaterThan(0.000133);
  });

  it("takes the dearest model of the fallback list and refuses a model with no price", () => {
    const prices = { a: { promptUsd: 1e-7, completionUsd: 1e-7 }, b: { promptUsd: 1e-6, completionUsd: 1e-6 } };
    const req = { messages: [{ role: "user" as const, content: "hi" }], maxTokens: 10 };
    expect(callBoundUsd(prices, { ...req, models: ["a", "b"] })).toBe(callBoundUsd(prices, { ...req, models: ["b"] }));
    expect(() => callBoundUsd(prices, { ...req, models: ["c"] })).toThrow(/no list price/);
  });
});

describe("cleanText", () => {
  it("never cuts an emoji in half", () => {
    const cut = cleanText("ab😀😀", 3, () => undefined);
    expect(cut).toBe("ab😀...");
    expect(JSON.parse(JSON.stringify(cut))).toBe(cut);
  });
});
