import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ChatModel } from "../../src/llm.ts";
import { loadQuestions, OUT_DIR, type SavedRun } from "../questions.ts";
import { toDisplay } from "../../src/display/build.ts";
import { autoChecks, type AutoChecks } from "./checks.ts";
import { upgradeRecord } from "./legacy.ts";
import { secondScan, type SecondScan } from "./secondScan.ts";
import { judge, type JudgeModel, type JudgeVerdict } from "./judge.ts";
import { score, type Score } from "./rubric.ts";
import { repeatTable, type PassScore } from "./repeatTable.ts";
import { scoreTable } from "./table.ts";

export interface ScoreOptions {
  passes: string[];
  judge: JudgeModel;
  /** The model of the second contact scan of each display object (round 4, A4). */
  scanModel: string;
}

function passDirs(requested: string[]): string[] {
  if (requested.length) return requested;
  if (!existsSync(OUT_DIR)) return [];
  return readdirSync(OUT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** The judge's verdict for a run, cached next to the run so re-scoring does not bill the judge twice. */
async function verdictFor(llm: ChatModel, model: JudgeModel, file: URL, saved: SavedRun): Promise<JudgeVerdict | null> {
  const cache = new URL(file.href.replace(/\.json$/, `.verdict-${model.model}${model.reasoning ? "-reasoning" : ""}.json`));
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8")) as JudgeVerdict;
  const q = loadQuestions().find((x) => x.id === saved.questionId);
  if (!saved.output || !q) return null;
  try {
    const verdict = await judge(llm, model, q, saved.output.answer, saved.output.evidence);
    writeFileSync(cache, JSON.stringify(verdict, null, 2));
    return verdict;
  } catch (err) {
    console.error(`judge failed on ${saved.questionId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * The second scan of a run's display object, cached next to the run like the judge's verdict, under
 * a digest of the display object so a change in how it is built scans it again.
 */
async function scanFor(llm: ChatModel, model: string, file: URL, saved: SavedRun): Promise<SecondScan | null> {
  if (!saved.output) return null;
  const display = toDisplay(upgradeRecord(saved.output));
  const digest = createHash("sha256").update(JSON.stringify(display)).digest("hex").slice(0, 12);
  const cache = new URL(file.href.replace(/\.json$/, `.scan-${model}-${digest}.json`));
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8")) as SecondScan;
  const scan = await secondScan(llm, model, display);
  writeFileSync(cache, JSON.stringify(scan, null, 2));
  return scan;
}

/** The automatic checks with the second scan's verdict: a hit fails the contact check; a failed scan is noted. */
function withScan(checks: AutoChecks, scan: SecondScan | null): AutoChecks {
  if (!scan) return checks;
  const notes = [...scan.hits.map((h) => `contact (second scan): ${h}`), ...(scan.failed ? ["second contact scan could not be read"] : [])];
  return { ...checks, noContact: checks.noContact && scan.hits.length === 0, problems: [...checks.problems, ...notes] };
}

/** Scores every saved run in the chosen passes, prints one table per pass, then one over all runs by question. */
export async function benchScore(llm: ChatModel, options: ScoreOptions): Promise<PassScore[]> {
  const questions = loadQuestions();
  const runs: PassScore[] = [];
  const dirs = passDirs(options.passes);
  for (const pass of dirs) {
    const dir = new URL(`${pass}/`, OUT_DIR);
    const files = readdirSync(dir).filter((f) => /^q\d+.*\.r\d+\.json$/.test(f)).sort();
    const scores: Score[] = [];
    let judgeUsd = 0;
    for (const name of files) {
      const file = new URL(name, dir);
      const saved = JSON.parse(readFileSync(file, "utf8")) as SavedRun;
      const q = questions.find((x) => x.id === saved.questionId);
      if (!q) continue;
      const verdict = await verdictFor(llm, options.judge, file, saved);
      judgeUsd += verdict?.costUsd ?? 0;
      const scan = await scanFor(llm, options.scanModel, file, saved);
      judgeUsd += scan?.costUsd ?? 0;
      const checks = withScan(autoChecks(saved), scan);
      const scored = score(q, saved, checks, verdict);
      scores.push(scored);
      runs.push({ pass: `${pass} r${saved.repeat}`, score: scored });
      checks.problems.forEach((p) => console.error(`${saved.questionId}: ${p}`));
    }
    const judgeName = `${options.judge.model}${options.judge.reasoning ? "-reasoning" : ""}`;
    writeFileSync(new URL(`scores-${judgeName}.json`, dir), JSON.stringify(scores, null, 2));
    console.log(`${scoreTable(pass, scores)}\n\njudge ${judgeName}, second scan ${options.scanModel}, judge and scan cost $${judgeUsd.toFixed(6)}\n`);
  }
  if (runs.length) console.log(repeatTable(`${runs.length} runs over ${dirs.length} pass directories`, runs));
  return runs;
}
