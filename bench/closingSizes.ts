import { readdirSync, readFileSync, statSync } from "node:fs";
import { displayTexts, scanRequest } from "../src/display/gate.ts";
import { MemoryEvidenceStore } from "../src/evidence.ts";
import { narrativeRequest } from "../src/finish/narrative.ts";
import { parseFinish } from "../src/finish/parse.ts";
import { validateFinish } from "../src/finish/validate.ts";
import { subjectContext } from "../src/finish/subjects.ts";
import { claimsRequest } from "../src/finish/verify.ts";
import type { ChatRequest } from "../src/llm.ts";
import type { RunOutput } from "../src/trace.ts";
import { OUT_DIR, type SavedRun } from "./questions.ts";
import { upgradeRecord } from "./score/legacy.ts";

/** A request's bytes as every text call's bound counts them. */
const bytes = (r: ChatRequest | null | undefined): number => (r ? Buffer.byteLength(JSON.stringify({ messages: r.messages, tools: r.tools ?? [] })) : 0);

/** The finish the run's last turn accepted, validated as the agent validated it, or null for a forced run. */
function acceptedFinish(o: RunOutput, store: MemoryEvidenceStore): ReturnType<typeof validateFinish>["kept"] | null {
  const finishes = o.trace.flatMap((t) => t.toolCalls).filter((c) => c.name === "finish" && c.result.accepted === true);
  const last = finishes.at(-1);
  if (!last) return null;
  const raw = JSON.parse(last.args || "{}") as Record<string, unknown>;
  return validateFinish(store, parseFinish(raw), { nowSec: o.nowSec, notFound: o.answer.notFound }).kept;
}

function runs(): RunOutput[] {
  const out: RunOutput[] = [];
  for (const dir of readdirSync(OUT_DIR)) {
    const path = new URL(`${dir}/`, OUT_DIR);
    if (!statSync(path).isDirectory()) continue;
    for (const f of readdirSync(path).filter((n) => /^q\d+.*\.r\d+\.json$/.test(n))) {
      const saved = JSON.parse(readFileSync(new URL(f, path), "utf8")) as SavedRun;
      if (saved.output?.answer.checks && saved.mode === "agent") out.push(upgradeRecord(saved.output));
    }
  }
  return out;
}

/**
 * Round 4, B5: the request each closing call would have sent, over every saved agent run in the
 * answer shape of round 3 on (declared checks), so the closing hold can be sized from what was
 * measured. Prints the largest and the median of each.
 */
export function closingSizes(model: string): void {
  const sizes = { claims: [] as number[], narrative: [] as number[], scan: [] as number[] };
  const all = runs();
  for (const o of all) {
    const store = MemoryEvidenceStore.fromSnapshot(o.evidence);
    const kept = acceptedFinish(o, store);
    if (kept) {
      sizes.claims.push(bytes(claimsRequest(subjectContext(store, kept, o.nowSec, o.answer.question), kept, model)?.request));
      sizes.narrative.push(bytes(narrativeRequest(subjectContext(store, kept, o.nowSec, o.answer.question), kept, model, o.answer.question)?.request));
    }
    sizes.scan.push(bytes(scanRequest(displayTexts({ ...o, gate: { path: "model", reason: null, removed: [], call: null } }), model)));
  }
  console.log(`${all.length} saved agent runs`);
  for (const [name, list] of Object.entries(sizes)) {
    const sorted = [...list].sort((a, b) => a - b);
    console.log(`${name}: ${list.length} requests, largest ${sorted.at(-1) ?? 0} bytes, median ${sorted[Math.floor(sorted.length / 2)] ?? 0} bytes`);
  }
}
