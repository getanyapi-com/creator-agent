import { median } from "../../src/metrics.ts";
import type { Score } from "./rubric.ts";

const pct = (v: number | null): string => (v === null ? "n/a" : `${Math.round(v * 100)}%`);
const yes = (v: boolean): string => (v ? "ok" : "FAIL");

function checksCell(s: Score): string {
  const c = s.checks;
  return `ids ${yes(c.idsResolve)} fig ${yes(c.figuresMatch)} budget ${yes(c.withinBudget)} turns ${yes(c.withinTurns)} contact ${yes(c.noContact)}`;
}

function mean(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
}

/** A markdown table per pass: one row per run, then the overall row. */
export function scoreTable(title: string, scores: Score[]): string {
  const head = "| question | finished | creators (fit / partly) | automatic checks | valid results | criterion accuracy | claim support | fails | cost | wall |";
  const rule = "|---|---|---|---|---|---|---|---|---|---|";
  const rows = scores.map((s) =>
    [
      s.questionId,
      s.finished,
      `${s.creators} (${s.fits} / ${s.partly})`,
      checksCell(s),
      s.judged || s.failedOutright ? pct(s.validResults) : "judge failed",
      pct(s.criterionAccuracy),
      pct(s.claimSupport),
      s.fails.length ? `FAIL: ${s.fails.join("; ")}` : "-",
      `$${s.costUsd.toFixed(4)}`,
      `${s.wallSec.toFixed(0)}s`,
    ].join(" | "),
  );
  const allChecks = scores.filter((s) => Object.values(s.checks).every((v) => typeof v !== "boolean" || v)).length;
  const overall = [
    "**overall**",
    `${scores.filter((s) => s.finished === "model").length}/${scores.length} by model`,
    `${scores.reduce((a, s) => a + s.creators, 0)} (${scores.reduce((a, s) => a + s.fits, 0)} / ${scores.reduce((a, s) => a + s.partly, 0)})`,
    `${allChecks}/${scores.length} all ok`,
    pct(mean(scores.map((s) => s.validResults))),
    pct(mean(scores.map((s) => s.criterionAccuracy))),
    pct(mean(scores.map((s) => s.claimSupport))),
    `${scores.filter((s) => s.failedOutright).length} failed`,
    `$${scores.reduce((a, s) => a + s.costUsd, 0).toFixed(4)} total`,
    `median ${(median(scores.map((s) => s.wallSec)) ?? 0).toFixed(0)}s`,
  ].join(" | ");
  return [`### ${title}`, "", head, rule, ...rows.map((r) => `| ${r} |`), `| ${overall} |`].join("\n");
}
