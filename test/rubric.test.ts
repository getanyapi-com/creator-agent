import { describe, expect, it } from "vitest";
import type { Question, SavedRun } from "../bench/questions.ts";
import type { AutoChecks } from "../bench/score/checks.ts";
import type { CreatorVerdict, JudgeVerdict } from "../bench/score/judge.ts";
import { score } from "../bench/score/rubric.ts";

const ok: AutoChecks = { idsResolve: true, figuresMatch: true, withinBudget: true, withinTurns: true, noContact: true, problems: [] };
const q = (over: Partial<Question>): Question => ({ id: "q", family: "", results: "creators", text: "", wanted: 10, unanswerable: false, good: "", ...over });
const saved = (creators: number, budgetNote: string | null = null) =>
  ({ output: { answer: { creators: Array.from({ length: creators }), budgetNote, finishedBy: "model" }, costs: { totalUsd: 0 }, wallMs: 0 } }) as unknown as SavedRun;
const creator = (fit: CreatorVerdict["fit"], i: number): CreatorVerdict => ({ handle: `c${i}`, fit, reason: "", criteria: [] });
const verdict = (fits: CreatorVerdict["fit"][], over: Partial<JudgeVerdict> = {}): JudgeVerdict => ({
  creators: fits.map(creator),
  patterns: [],
  answersQuestion: true,
  statesPoorFit: false,
  explainsShortfall: false,
  notes: "",
  model: "j",
  costUsd: 0,
  ...over,
});

describe("score", () => {
  it("fails an answer padded with off-topic creators", () => {
    const fits: CreatorVerdict["fit"][] = [...Array<CreatorVerdict["fit"]>(10).fill("yes"), "no", "no"];
    const s = score(q({}), saved(12), ok, verdict(fits));
    expect(s.failedOutright).toBe(true);
    expect(s.fails[0]).toMatch(/^padded with @c10, @c11/);
    expect(s.validResults).toBe(0);
  });

  it("fails one obvious creator when ten were asked for, unless the answer says why", () => {
    expect(score(q({}), saved(1), ok, verdict(["yes"])).fails).toEqual(["short: 1 of 10 asked, not explained"]);
    const explained = score(q({}), saved(1), ok, verdict(["yes"], { explainsShortfall: true }));
    expect(explained.failedOutright).toBe(false);
    expect(explained.validResults).toBeCloseTo(0.1);
    expect(score(q({}), saved(1, "Since you're on the free tier..."), ok, verdict(["yes"])).failedOutright).toBe(false);
  });

  it("fails creators returned for a question that cannot be answered, without saying so", () => {
    const unanswerable = q({ unanswerable: true, wanted: null });
    expect(score(unanswerable, saved(3), ok, verdict(["partly", "partly", "partly"])).fails).toEqual(["creators returned without saying the question cannot be answered well"]);
    const said = score(unanswerable, saved(3), ok, verdict(["partly", "partly", "partly"], { statesPoorFit: true }));
    expect(said.failedOutright).toBe(false);
    expect(said.validResults).toBe(1);
  });

  it("passes a full, on-topic answer", () => {
    const s = score(q({}), saved(10), ok, verdict(Array<CreatorVerdict["fit"]>(10).fill("yes")));
    expect(s).toMatchObject({ failedOutright: false, validResults: 1, fits: 10 });
  });
});
