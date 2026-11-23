import { readdirSync, readFileSync } from "node:fs";
import { MemoryEvidenceStore } from "../../src/evidence.ts";
import { parseFinish, type FinishArgs } from "../../src/finish/parse.ts";
import { validateFinish } from "../../src/finish/validate.ts";
import { withQuestionChecks } from "../../src/intake/merge.ts";
import type { RunOutput } from "../../src/trace.ts";
import { OUT_DIR, type SavedRun } from "../questions.ts";
import { upgradeRecord } from "../score/legacy.ts";

/** One saved run as the closing check met it: its question, evidence and the finish it read. */
export interface ClosingInput {
  /** `<pass dir>/<run file>`, the run's name in labels and reports. */
  run: string;
  question: string;
  store: MemoryEvidenceStore;
  nowSec: number;
  /** The accepted finish after validation, with the question's checks in force: what the verifier was sent. */
  args: FinishArgs;
}

/**
 * The finish the closing check read in a saved run: the last finish the run accepted, validated as
 * the agent validated it, with the checks the intake step fixed for the run (round 4, F1). Null for a
 * run that ended without an accepted finish.
 */
export function closingInput(run: string, saved: RunOutput): ClosingInput | null {
  const o = upgradeRecord(saved);
  const store = MemoryEvidenceStore.fromSnapshot(o.evidence);
  const accepted = o.trace.flatMap((t) => t.toolCalls).filter((c) => c.name === "finish" && c.result.accepted === true).at(-1);
  if (!accepted) return null;
  const parsed = parseFinish(JSON.parse(accepted.args || "{}") as Record<string, unknown>);
  const fixed = o.intake.status === "read" ? o.intake.checks : null;
  const args = { ...parsed, checks: withQuestionChecks(fixed, parsed.checks), checksReadBy: fixed ? ("code" as const) : ("agent" as const) };
  const kept = validateFinish(store, args, { nowSec: o.nowSec, notFound: o.answer.notFound }).kept;
  return { run, question: o.answer.question, store, nowSec: o.nowSec, args: kept };
}

/** Every saved agent run in the named pass directories that ended in an accepted finish. */
export function closingInputs(passes: string[]): ClosingInput[] {
  const out: ClosingInput[] = [];
  for (const pass of passes) {
    const dir = new URL(`${pass}/`, OUT_DIR);
    for (const f of readdirSync(dir).filter((n) => /^q\d+.*\.r\d+\.json$/.test(n)).sort()) {
      const saved = JSON.parse(readFileSync(new URL(f, dir), "utf8")) as SavedRun;
      const input = saved.output && saved.mode === "agent" ? closingInput(`${pass}/${f}`, saved.output) : null;
      if (input) out.push(input);
    }
  }
  return out;
}

/** The development passes this round measures: the final three-pass measurement and the q07 and q12 re-measurements after it. */
export const MEASURED_PASSES = [
  "2026-11-21T19-09-34-268Z-agent-free",
  "2026-11-21T19-09-34-363Z-agent-free",
  "2026-11-21T19-09-34-390Z-agent-free",
  "2026-11-21T20-36-22-467Z-agent-free",
  "2026-11-21T20-36-23-386Z-agent-free",
  "2026-11-21T20-36-23-917Z-agent-free",
  "2026-11-21T20-45-25-943Z-agent-free",
  "2026-11-21T20-45-26-169Z-agent-free",
  "2026-11-21T20-45-27-643Z-agent-free",
];
