import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ChatModel } from "../../src/llm.ts";
import { mapLimit } from "../../src/concurrency.ts";
import { TOOL_PARALLELISM } from "../../src/limits.ts";
import { loadQuestions, OUT_DIR, type SavedRun } from "../questions.ts";
import { judgeCreator, type CreatorVerdict, type Fit, type JudgeModel } from "./judge.ts";
import { creatorForJudge } from "./judgeInput.ts";

/** One creator result labelled by hand (`bench/labels/creators.jsonl`). */
export interface Label {
  key: string;
  pass: string;
  question: string;
  handle: string;
  fit: Fit;
  criteria: { criterion: string; state: string; right: boolean }[];
  reason: string;
}

export function loadLabels(): Label[] {
  const text = readFileSync(new URL("../labels/creators.jsonl", import.meta.url), "utf8");
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Label);
}

interface Judged {
  label: Label;
  verdict: CreatorVerdict | null;
  error: string | null;
  costUsd: number;
}

export interface Agreement {
  model: string;
  judged: number;
  failed: number;
  fitExact: number;
  fitYesOrNot: number;
  criteria: number;
  criteriaCompared: number;
  costUsd: number;
  disagreements: string[];
}

/** Judges each labelled creator once per model, caching the verdicts so a re-run does not bill twice. */
async function judgeAll(llm: ChatModel, judge: JudgeModel): Promise<Judged[]> {
  const dir = new URL("judge-eval/", OUT_DIR);
  mkdirSync(dir, { recursive: true });
  const cacheFile = new URL(`${judge.model}${judge.reasoning ? "-reasoning" : ""}.json`, dir);
  const cache = existsSync(cacheFile) ? (JSON.parse(readFileSync(cacheFile, "utf8")) as Record<string, Judged>) : {};
  const questions = loadQuestions();
  const out = await mapLimit(loadLabels(), TOOL_PARALLELISM, async (label): Promise<Judged> => {
    const hit = cache[label.key];
    if (hit?.verdict) return { ...hit, label };
    const saved = JSON.parse(readFileSync(new URL(`${label.pass}/${label.question}.r1.json`, OUT_DIR), "utf8")) as SavedRun;
    const q = questions.find((x) => x.id === label.question);
    const c = saved.output?.answer.creators.find((x) => x.handle === label.handle);
    if (!q || !c || !saved.output) return { label, verdict: null, error: "labelled creator not found in its saved run", costUsd: 0 };
    try {
      const { verdict, costUsd } = await judgeCreator(llm, judge, q, creatorForJudge(c, saved.output.evidence));
      return { label, verdict, error: null, costUsd };
    } catch (err) {
      return { label, verdict: null, error: err instanceof Error ? err.message : String(err), costUsd: 0 };
    }
  });
  writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(out.map((j) => [j.label.key, j])), null, 2));
  return out;
}

/** How often a judge model agrees with the hand labels: on fit, on fit as yes or not, and on each criterion. */
export async function agreement(llm: ChatModel, judge: JudgeModel): Promise<Agreement> {
  const judged = await judgeAll(llm, judge);
  const a: Agreement = { model: `${judge.model}${judge.reasoning ? " (reasoning)" : ""}`, judged: 0, failed: 0, fitExact: 0, fitYesOrNot: 0, criteria: 0, criteriaCompared: 0, costUsd: 0, disagreements: [] };
  for (const { label, verdict, error, costUsd } of judged) {
    a.costUsd += costUsd;
    if (!verdict) {
      a.failed += 1;
      a.disagreements.push(`${label.key}: judge failed (${error ?? ""})`);
      continue;
    }
    a.judged += 1;
    if (verdict.fit === label.fit) a.fitExact += 1;
    else a.disagreements.push(`${label.key}: fit ${verdict.fit}, label ${label.fit} - judge: ${verdict.reason.slice(0, 160)}`);
    if ((verdict.fit === "yes") === (label.fit === "yes")) a.fitYesOrNot += 1;
    label.criteria.forEach((k, i) => {
      const v = verdict.criteria[i];
      if (!v) return;
      a.criteriaCompared += 1;
      if (v.right === k.right) a.criteria += 1;
      else a.disagreements.push(`${label.key}: criterion "${k.criterion}" right=${v.right}, label ${k.right}`);
    });
  }
  return a;
}
