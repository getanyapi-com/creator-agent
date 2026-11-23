import { passMeans, repeatRows, type PassScore } from "./repeatTable.ts";

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/**
 * The same runs scored by two judges, side by side (round 4, C3): per question, each judge's mean
 * valid results with its spread, runs passing and creators that fit; then the overall mean of the
 * per-pass means. Scores from different judges are not comparable with each other, only with their own.
 */
export function judgesTable(a: { judge: string; runs: PassScore[] }, b: { judge: string; runs: PassScore[] }): string {
  const head = `| question | ${a.judge}: valid (spread) | runs passing | fit (mean) | ${b.judge}: valid (spread) | runs passing | fit (mean) |`;
  const rule = "|---|---|---|---|---|---|---|";
  const rowsB = new Map(repeatRows(b.runs).map((r) => [r.questionId, r]));
  const fits = (runs: PassScore[], q: string): string => mean(runs.filter((r) => r.score.questionId === q).map((r) => r.score.fits)).toFixed(1);
  const rows = repeatRows(a.runs).map((ra) => {
    const rb = rowsB.get(ra.questionId);
    const right = rb ? [`${pct(rb.meanValid)} (${pct(rb.spreadValid)})`, `${rb.passing}/${rb.runs}`, fits(b.runs, ra.questionId)] : ["-", "-", "-"];
    return `| ${[ra.questionId, `${pct(ra.meanValid)} (${pct(ra.spreadValid)})`, `${ra.passing}/${ra.runs}`, fits(a.runs, ra.questionId), ...right].join(" | ")} |`;
  });
  const overall = (runs: PassScore[]): string[] => {
    const means = passMeans(runs).map((m) => m.mean);
    return [`${pct(mean(means))} (passes ${means.map(pct).join(", ")})`, `${runs.filter((r) => !r.score.failedOutright).length}/${runs.length}`, mean(runs.map((r) => r.score.fits)).toFixed(1)];
  };
  return [head, rule, ...rows, `| **overall** | ${[...overall(a.runs), ...overall(b.runs)].join(" | ")} |`].join("\n");
}
