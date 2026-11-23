import { parseArgs } from "node:util";
import type { Tier } from "../src/answer.ts";
import { VERIFIER_MODEL } from "../src/models.ts";
import { DEFAULT_JUDGE_MODEL, liveChat, SECOND_SCAN_MODEL } from "./live.ts";
import type { Mode } from "./questions.ts";
import { benchRun } from "./run.ts";
import { agreement } from "./score/judgeEval.ts";
import { closingLive } from "./closingLive.ts";
import { closingSizes } from "./closingSizes.ts";
import { closingDump } from "./replay/dump.ts";
import { closingReplay } from "./replay/replay.ts";
import { intakeLive } from "./intakeLive.ts";
import { judgesTable } from "./score/judgesTable.ts";
import { benchScore } from "./score/score.ts";
import { videoCompare } from "./videoCompare.ts";

const USAGE = `usage:
  pnpm bench run --question <id>[,<id>...]|all [--tier free|wallet] [--budget <usd>] [--repeat <n>] [--mode agent|baseline]
  pnpm bench score [--pass <dir name>]... [--judge-model <model>[:low]]... [--low-reasoning]
  pnpm bench judge-eval --judge-model <model>... [--low-reasoning]
  pnpm bench video-compare [--video <id>]...
  pnpm bench closing-sizes
  pnpm bench closing-live --pass <dir name>
  pnpm bench intake-live
  pnpm bench closing-dump
  pnpm bench closing-replay --tag <name>
keys: ANYAPI_KEY_FILE and SURPLUS_KEY_FILE name the files that hold them`;

function tierFrom(tier: string, budget: string | undefined): Tier {
  if (tier === "free") return { kind: "free" };
  if (tier !== "wallet") throw new Error("--tier must be free or wallet");
  const budgetUsd = Number(budget);
  if (!budget || !Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error("--tier wallet needs --budget <usd>");
  return { kind: "wallet", budgetUsd };
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      question: { type: "string" },
      tier: { type: "string", default: "free" },
      budget: { type: "string" },
      repeat: { type: "string", default: "1" },
      mode: { type: "string", default: "agent" },
      pass: { type: "string", multiple: true, default: [] },
      "judge-model": { type: "string", multiple: true, default: [DEFAULT_JUDGE_MODEL] },
      "low-reasoning": { type: "boolean", default: false },
      video: { type: "string", multiple: true, default: [] },
      tag: { type: "string" },
    },
  });
  if (command === "run") {
    if (!values.question) throw new Error("--question is required");
    if (values.mode !== "agent" && values.mode !== "baseline") throw new Error("--mode must be agent or baseline");
    const repeat = Number(values.repeat);
    if (!Number.isInteger(repeat) || repeat < 1) throw new Error("--repeat must be a whole number");
    const dir = await benchRun({ question: values.question, tier: tierFrom(values.tier, values.budget), repeat, mode: values.mode as Mode });
    console.log(`saved to ${dir}`);
  } else if (command === "score") {
    // The judge reasons unless told not to (round 4, C3: "glm-5.3-flash with reasoning"); `model:low`
    // asks one judge for low effort. A second judge scores the same runs and the two print side by side.
    const scored = [];
    for (const spec of values["judge-model"]) {
      const [model = spec, effort] = spec.split(":");
      const judge = { model, reasoning: effort !== "low" && !values["low-reasoning"] };
      scored.push({ judge: spec, runs: await benchScore(liveChat(), { passes: values.pass, judge, scanModel: SECOND_SCAN_MODEL }) });
    }
    const [a, b] = scored;
    if (a && b) console.log(`\n### Two judges on the same runs\n\n${judgesTable(a, b)}`);
  } else if (command === "judge-eval") {
    for (const model of values["judge-model"]) {
      const a = await agreement(liveChat(), { model, reasoning: !values["low-reasoning"] });
      console.log(`${a.model}: judged ${a.judged}, failed ${a.failed}; fit agrees ${a.fitExact}/${a.judged}; yes-or-not agrees ${a.fitYesOrNot}/${a.judged}; criteria agree ${a.criteria}/${a.criteriaCompared}; cost $${a.costUsd.toFixed(5)}`);
      a.disagreements.forEach((d) => console.log(`  ${d}`));
    }
  } else if (command === "closing-sizes") {
    closingSizes(VERIFIER_MODEL);
  } else if (command === "closing-live") {
    await closingLive(liveChat(), VERIFIER_MODEL, values.pass[0] ?? "");
  } else if (command === "closing-dump") {
    closingDump();
  } else if (command === "closing-replay") {
    if (!values.tag) throw new Error("--tag is required");
    const llm = liveChat();
    await closingReplay(llm, await llm.listPrices([VERIFIER_MODEL]), VERIFIER_MODEL, values.tag);
  } else if (command === "intake-live") {
    const llm = liveChat();
    await intakeLive(llm, await llm.listPrices([VERIFIER_MODEL]), VERIFIER_MODEL);
  } else if (command === "video-compare") {
    console.log(`saved to ${await videoCompare(values.video)}`);
  } else {
    console.log(USAGE);
    process.exitCode = command ? 1 : 0;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
