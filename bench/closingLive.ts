import { readdirSync, readFileSync } from "node:fs";
import { mapLimit } from "../src/concurrency.ts";
import { displayTexts, parseScan, scanRequest } from "../src/display/gate.ts";
import { MemoryEvidenceStore } from "../src/evidence.ts";
import { narrativeRequest } from "../src/finish/narrative.ts";
import { parseFinish } from "../src/finish/parse.ts";
import { validateFinish } from "../src/finish/validate.ts";
import { subjectContext } from "../src/finish/subjects.ts";
import { claimsRequest, parseVerdicts, strictJson } from "../src/finish/verify.ts";
import { TOOL_PARALLELISM } from "../src/limits.ts";
import type { ChatModel, ChatRequest } from "../src/llm.ts";
import { OUT_DIR, type SavedRun } from "./questions.ts";
import { upgradeRecord } from "./score/legacy.ts";

interface Measured {
  run: string;
  call: "claims" | "narrative" | "scan";
  ms: number;
  completionTokens: number | null;
  costUsd: number | null;
  finishReason: string | null;
  readable: boolean;
  error: string | null;
}

async function measure(llm: ChatModel, model: string, run: string, call: Measured["call"], request: ChatRequest, read: (content: string) => boolean): Promise<Measured> {
  const started = Date.now();
  try {
    const done = await llm.complete(model, request);
    const content = typeof done.content === "string" ? done.content : "";
    return { run, call, ms: Date.now() - started, completionTokens: done.completionTokens ?? null, costUsd: done.costUsd, finishReason: done.finishReason, readable: read(content), error: null };
  } catch (err) {
    return { run, call, ms: Date.now() - started, completionTokens: null, costUsd: null, finishReason: null, readable: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Round 4, C1: the three closing calls replayed live on GLM over one pass's saved runs, to set their
 * output allowance and time limit from measured calls. Prints each call and the slowest and largest.
 */
export async function closingLive(llm: ChatModel, model: string, pass: string): Promise<void> {
  const dir = new URL(`${pass}/`, OUT_DIR);
  const jobs: (() => Promise<Measured>)[] = [];
  for (const f of readdirSync(dir).filter((n) => /^q\d+.*\.r\d+\.json$/.test(n))) {
    const saved = JSON.parse(readFileSync(new URL(f, dir), "utf8")) as SavedRun;
    if (!saved.output) continue;
    const o = upgradeRecord(saved.output);
    const store = MemoryEvidenceStore.fromSnapshot(o.evidence);
    const accepted = o.trace.flatMap((t) => t.toolCalls).filter((c) => c.name === "finish" && c.result.accepted === true).at(-1);
    if (accepted) {
      const kept = validateFinish(store, parseFinish(JSON.parse(accepted.args) as Record<string, unknown>), { nowSec: o.nowSec, notFound: o.answer.notFound }).kept;
      const claims = claimsRequest(subjectContext(store, kept, o.nowSec, o.answer.question), kept, model);
      const narrative = narrativeRequest(subjectContext(store, kept, o.nowSec, o.answer.question), kept, model, o.answer.question);
      if (claims) jobs.push(() => measure(llm, model, f, "claims", claims.request, (c) => parseVerdicts(c, claims.asked) !== null));
      if (narrative) jobs.push(() => measure(llm, model, f, "narrative", narrative.request, (c) => Array.isArray(strictJson(c)?.sentences)));
    }
    const texts = displayTexts({ ...o, gate: { path: "model", reason: null, removed: [], call: null } });
    if (texts.length) jobs.push(() => measure(llm, model, f, "scan", scanRequest(texts, model), (c) => parseScan(c, texts) !== null));
  }
  const results = await mapLimit(jobs, TOOL_PARALLELISM, (job) => job());
  for (const r of results) console.log(`${r.run} ${r.call}: ${(r.ms / 1000).toFixed(1)}s, ${r.completionTokens ?? "?"} tokens, ${r.finishReason ?? "-"}, readable ${r.readable}${r.error ? `, error ${r.error}` : ""}`);
  for (const call of ["claims", "narrative", "scan"] as const) {
    const these = results.filter((r) => r.call === call);
    const ms = these.map((r) => r.ms);
    const tokens = these.map((r) => r.completionTokens ?? 0);
    console.log(`${call}: ${these.length} calls, ${these.filter((r) => r.readable).length} readable, slowest ${(Math.max(...ms) / 1000).toFixed(1)}s, most output ${Math.max(...tokens)} tokens`);
  }
  console.log(`billed $${results.reduce((s, r) => s + (r.costUsd ?? 0), 0).toFixed(5)}`);
}
