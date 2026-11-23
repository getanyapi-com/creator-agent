import { describe, expect, it } from "vitest";
import { passMeans, repeatRows } from "../bench/score/repeatTable.ts";
import type { Score } from "../bench/score/rubric.ts";

const run = (pass: string, questionId: string, validResults: number, failedOutright = false) => ({
  pass,
  score: { questionId, validResults, failedOutright, fits: 0, partly: 0, costUsd: 0, wallSec: 0 } as Score,
});

describe("repeatRows and passMeans", () => {
  const runs = [run("a", "q1", 1), run("b", "q1", 0.5), run("c", "q1", 0.9), run("a", "q2", 0, true), run("b", "q2", 1), run("c", "q2", 0, true)];

  it("gives each question its mean, spread and whether most of its runs pass", () => {
    expect(repeatRows(runs)).toEqual([
      { questionId: "q1", runs: 3, meanValid: expect.closeTo(0.8), spreadValid: 0.5, passing: 3, majorityPasses: true },
      { questionId: "q2", runs: 3, meanValid: 1 / 3, spreadValid: 1, passing: 1, majorityPasses: false },
    ]);
  });

  it("gives each pass its mean over the questions", () => {
    expect(passMeans(runs)).toEqual([
      { pass: "a", mean: 0.5 },
      { pass: "b", mean: 0.75 },
      { pass: "c", mean: expect.closeTo(0.45) },
    ]);
  });
});
