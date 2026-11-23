import { Budget } from "../src/budget.ts";
import { checkLabel, type Check } from "../src/finish/checks.ts";
import { readQuestionChecks } from "../src/intake/intake.ts";
import type { ChatModel } from "../src/llm.ts";
import type { ModelPrices } from "../src/modelCost.ts";
import { mapLimit } from "../src/concurrency.ts";
import { TOOL_PARALLELISM } from "../src/limits.ts";
import { PHRASINGS } from "./intakePhrasings.ts";
import { loadQuestions } from "./questions.ts";

const q = (kind: Check["kind"], value: number | string): Check => ({ kind, value, from: "question" });

/**
 * The checks each dev question states, written by hand from reading it (round 4, F1). "Around 1,500"
 * (q03), "small" (q04), "recently" (q10) state no limit; "this month" is 30 days, "this week" 7.
 */
export const HAND_CHECKS: Record<string, { checks: Check[]; wanted: number | null }> = {
  "q01-ai-study-us": {
    checks: [q("followers_at_most", 10_000), q("proof_views_at_least", 100_000), q("proof_posted_within_days", 30), q("proof_region", "US")],
    wanted: 10,
  },
  "q02-claude-sub10k": { checks: [q("followers_at_most", 10_000)], wanted: null },
  "q03-nyu-1500": { checks: [], wanted: 10 },
  "q04-toy-unboxing": { checks: [q("proof_posted_within_days", 30)], wanted: null },
  "q05-pingo-ai": { checks: [], wanted: null },
  "q06-hooks-language": { checks: [q("proof_posted_within_days", 7)], wanted: null },
  "q07-compare-three": { checks: [], wanted: null },
  "q08-uk-walking": { checks: [q("followers_at_most", 20_000), q("proof_region", "GB")], wanted: null },
  "q09-b2b-payroll-cfo": { checks: [], wanted: null },
  "q10-partnered-anthropic": { checks: [], wanted: null },
  "q11-why-video": { checks: [], wanted: null },
  "q12-my-app": { checks: [], wanted: null },
};

const key = (c: Check): string => checkLabel(c);

/** One live pass of the intake step alone over the 12 dev questions and the written phrasings (round 5), beside the hand-written checks; model cost only. */
export async function intakeLive(llm: ChatModel, prices: ModelPrices, model: string): Promise<void> {
  const cases = [
    ...loadQuestions().map((q) => ({ id: q.id, text: q.text, hand: HAND_CHECKS[q.id] ?? { checks: [], wanted: null } })),
    ...PHRASINGS.map((p, i) => ({ id: `w${String(i + 1).padStart(2, "0")}`, text: p.text, hand: { checks: p.checks.map((c) => c.check), wanted: p.wanted } })),
  ];
  const results = await mapLimit(cases, TOOL_PARALLELISM, async (c) => ({ c, got: await readQuestionChecks({ llm, budget: new Budget(1), prices, model }, c.text, 0) }));
  let cost = 0;
  let mismatches = 0;
  console.log("| question | status | read by the code | written by hand | mismatch | refused proposals | time |\n|---|---|---|---|---|---|---|");
  for (const { c, got } of results) {
    const read = new Set(got.checks.map(key));
    const want = new Set(c.hand.checks.map(key));
    const diff = [
      ...[...want].filter((k) => !read.has(k)).map((k) => `missing "${k}"`),
      ...[...read].filter((k) => !want.has(k)).map((k) => `extra "${k}"`),
      ...(got.wanted === c.hand.wanted ? [] : [`wanted ${got.wanted ?? "none"} not ${c.hand.wanted ?? "none"}`]),
    ];
    if (diff.length) mismatches += 1;
    cost += got.call?.costUsd ?? 0;
    const show = (cs: Check[], wanted: number | null): string => [...cs.map(key), ...(wanted === null ? [] : [`wanted ${wanted}`])].join("; ") || "none";
    const refused = got.rejected.map((r) => `${r.proposal} (${r.why})`).join("; ") || "-";
    console.log(`| ${c.id}: ${c.text} | ${got.status} | ${show(got.checks, got.wanted)} | ${show(c.hand.checks, c.hand.wanted)} | ${diff.join("; ") || "-"} | ${refused} | ${((got.call?.ms ?? 0) / 1000).toFixed(1)}s |`);
  }
  console.log(`\n${mismatches} of ${cases.length} questions differ from the hand-written checks; model cost $${cost.toFixed(6)}`);
}
