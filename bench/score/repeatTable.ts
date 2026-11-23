import { median } from "../../src/metrics.ts";
import type { Score } from "./rubric.ts";

/** One scored run and the pass it belongs to (a pass directory and repeat number). */
export interface PassScore {
  pass: string;
  score: Score;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const spread = (values: number[]): number => (values.length ? Math.max(...values) - Math.min(...values) : 0);

/** A run passes when it does not fail outright; a question passes when most of its runs pass. */
export function passesInMajority(scores: Score[]): boolean {
  return scores.filter((s) => !s.failedOutright).length * 2 > scores.length;
}

export interface RepeatRow {
  questionId: string;
  runs: number;
  meanValid: number;
  spreadValid: number;
  passing: number;
  majorityPasses: boolean;
}

export function repeatRows(runs: PassScore[]): RepeatRow[] {
  const byQuestion = new Map<string, Score[]>();
  runs.forEach((r) => byQuestion.set(r.score.questionId, [...(byQuestion.get(r.score.questionId) ?? []), r.score]));
  return [...byQuestion.entries()].map(([questionId, scores]) => {
    const valid = scores.map((s) => s.validResults ?? 0);
    return {
      questionId,
      runs: scores.length,
      meanValid: mean(valid),
      spreadValid: spread(valid),
      passing: scores.filter((s) => !s.failedOutright).length,
      majorityPasses: passesInMajority(scores),
    };
  });
}

/** The mean valid results over all questions within each pass, and their spread: the noise between passes. */
export function passMeans(runs: PassScore[]): { pass: string; mean: number }[] {
  const byPass = new Map<string, number[]>();
  runs.forEach((r) => byPass.set(r.pass, [...(byPass.get(r.pass) ?? []), r.score.validResults ?? 0]));
  return [...byPass.entries()].map(([pass, valid]) => ({ pass, mean: mean(valid) }));
}

/**
 * The table a tuning step is judged on: per question, the mean and spread of valid results over its
 * runs, how many runs passed, creators that fit, cost and wall time; then the overall mean, which is
 * the mean of the per-pass means, and the spread between passes.
 */
export function repeatTable(title: string, runs: PassScore[]): string {
  const head = "| question | runs | valid results mean | spread | runs passing | fit (mean) | fit + partly (mean) | cost (mean) | wall (median) |";
  const rule = "|---|---|---|---|---|---|---|---|---|";
  const rows = repeatRows(runs).map((r) => {
    const s = runs.filter((x) => x.score.questionId === r.questionId).map((x) => x.score);
    return [
      r.questionId,
      r.runs,
      pct(r.meanValid),
      pct(r.spreadValid),
      `${r.passing}/${r.runs}${r.majorityPasses ? "" : " FAILS"}`,
      mean(s.map((x) => x.fits)).toFixed(1),
      mean(s.map((x) => x.fits + x.partly)).toFixed(1),
      `$${mean(s.map((x) => x.costUsd)).toFixed(4)}`,
      `${(median(s.map((x) => x.wallSec)) ?? 0).toFixed(0)}s`,
    ].join(" | ");
  });
  const means = passMeans(runs);
  const all = runs.map((r) => r.score);
  const overall = [
    "**overall**",
    runs.length,
    pct(mean(means.map((m) => m.mean))),
    `${pct(spread(means.map((m) => m.mean)))} between passes (${means.map((m) => pct(m.mean)).join(", ")})`,
    `${all.filter((s) => !s.failedOutright).length}/${all.length}`,
    mean(all.map((x) => x.fits)).toFixed(1),
    mean(all.map((x) => x.fits + x.partly)).toFixed(1),
    `$${all.reduce((a, s) => a + s.costUsd, 0).toFixed(4)} total`,
    `${(median(all.map((x) => x.wallSec)) ?? 0).toFixed(0)}s`,
  ].join(" | ");
  return [`### ${title}`, "", head, rule, ...rows.map((r) => `| ${r} |`), `| ${overall} |`].join("\n");
}
