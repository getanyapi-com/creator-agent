import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runAgent } from "../src/agent.ts";
import type { Tier } from "../src/answer.ts";
import { runBaseline } from "../src/baseline.ts";
import { liveServices } from "./live.ts";
import { loadQuestions, OUT_DIR, type Mode, type SavedRun } from "./questions.ts";

export interface RunOptions {
  question: string;
  tier: Tier;
  repeat: number;
  mode: Mode;
}

/** Runs the chosen questions (one id, a comma-separated list, or all) one after another against the live services and saves each run. */
export async function benchRun(options: RunOptions): Promise<string> {
  const all = loadQuestions();
  const asked = options.question.split(",");
  const questions = options.question === "all" ? all : all.filter((q) => asked.includes(q.id));
  if (questions.length === 0) throw new Error(`no question with id ${options.question}`);
  const services = await liveServices();
  const pass = `${new Date().toISOString().replace(/[:.]/g, "-")}-${options.mode}-${options.tier.kind}`;
  const dir = new URL(`${pass}/`, OUT_DIR);
  mkdirSync(dir, { recursive: true });
  const run = options.mode === "agent" ? runAgent : runBaseline;
  for (const q of questions) {
    for (let repeat = 1; repeat <= options.repeat; repeat += 1) {
      const saved: SavedRun = {
        questionId: q.id,
        mode: options.mode,
        tier: options.tier,
        repeat,
        startedAt: new Date().toISOString(),
        output: null,
        error: null,
      };
      try {
        saved.output = await run(q.text, options.tier, services);
      } catch (err) {
        saved.error = err instanceof Error ? err.message : String(err);
      }
      writeFileSync(new URL(`${q.id}.r${repeat}.json`, dir), JSON.stringify(saved, null, 2));
      console.log(summary(saved));
    }
  }
  return fileURLToPath(dir);
}

function summary(saved: SavedRun): string {
  const o = saved.output;
  if (!o) return `${saved.questionId} r${saved.repeat}: ERROR ${saved.error?.split("\n")[0] ?? ""}`;
  const a = o.answer;
  return [
    `${saved.questionId} r${saved.repeat}:`,
    `${a.finishedBy}`,
    `creators ${a.creators.length}`,
    `turns ${o.modelTurns}`,
    `calls ${o.costs.dataCalls} (refused ${o.costs.refusedCalls})`,
    `cost $${o.costs.totalUsd.toFixed(4)}`,
    `wall ${(o.wallMs / 1000).toFixed(0)}s`,
  ].join(" ");
}
