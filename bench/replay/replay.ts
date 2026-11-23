import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Budget } from "../../src/budget.ts";
import { verifyFinish } from "../../src/closing.ts";
import { mapLimit } from "../../src/concurrency.ts";
import { TOOL_PARALLELISM } from "../../src/limits.ts";
import type { ChatModel } from "../../src/llm.ts";
import type { ModelPrices } from "../../src/modelCost.ts";
import { OUT_DIR } from "../questions.ts";
import { CachedChat, type Exchange } from "./cachedChat.ts";
import { closingItems, itemKey, wasKept, type ClosingItem } from "./items.ts";
import { closingInputs, MEASURED_PASSES } from "./savedRuns.ts";

/** One hand label (`bench/labels/closing.jsonl`): is the item shown by the evidence in its run. */
export interface ClosingLabel extends ClosingItem {
  run: string;
  label: "shown" | "not_shown";
  reason: string;
}

export const LABELS_FILE = new URL("../labels/closing.jsonl", import.meta.url);

export function readLabels(): ClosingLabel[] {
  return readFileSync(LABELS_FILE, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as ClosingLabel);
}

interface Outcome {
  key: string;
  label: ClosingLabel;
  kept: boolean;
  /** The verifier's own words on the item, when its reply gave them. */
  why: string | null;
}

/** Every object with a string id in a parsed request or reply, at any depth. */
function withIds(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) value.forEach((v) => withIds(v, out));
  else if (typeof value === "object" && value !== null) {
    const r = value as Record<string, unknown>;
    if (typeof r.id === "string") out.push(r);
    Object.values(r).forEach((v) => withIds(v, out));
  }
  return out;
}

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
};

/** The verifier's "why" for an item: the reply entry for the id the request gave the item's text. */
function whyFor(exchanges: Exchange[], item: ClosingItem): string | null {
  for (const ex of exchanges) {
    const sent = withIds(parsed(String(ex.request.messages[1]?.content ?? "")));
    const about = (r: Record<string, unknown>): boolean => item.kind === "sentence" || JSON.stringify(r).includes(item.kind === "criterion" ? item.subject.slice(1) : item.subject);
    const ids = new Set(sent.filter((r) => [r.claim, r.text].some((t) => typeof t === "string" && t.includes(item.text)) && about(r)).map((r) => String(r.id)));
    const entry = withIds(parsed(ex.content)).find((r) => ids.has(String(r.id)) && typeof r.why === "string");
    if (entry) return String(entry.why);
  }
  return null;
}

const pct = (a: number, b: number): string => (b ? `${a} of ${b} (${Math.round((100 * a) / b)}%)` : "none");

/**
 * Replays the closing check, as the code now builds it, on every labelled saved run (model calls
 * only; no data call), and reports against the hand labels: of the items labelled shown, how many it
 * kept; of those labelled not shown, how many it dropped. `tag` names the replay: the same tag reads
 * its answers from cache, a new one asks the model again.
 */
export async function closingReplay(llm: ChatModel, prices: ModelPrices, model: string, tag: string): Promise<void> {
  const labels = new Map(readLabels().map((l) => [itemKey(l.run, l), l]));
  const inputs = closingInputs(MEASURED_PASSES).filter((i) => [...labels.values()].some((l) => l.run === i.run));
  const outcomes = await mapLimit(inputs, TOOL_PARALLELISM, async (input) => {
    const chat = new CachedChat(llm, tag);
    const v = { llm: chat, budget: new Budget(1), prices, model };
    const done = await verifyFinish(v, input.store, input.args, input.question, input.nowSec, 0);
    const out: Outcome[] = [];
    for (const item of closingItems(input.args)) {
      const key = itemKey(input.run, item);
      const label = labels.get(key);
      if (label) out.push({ key, label, kept: wasKept(item, input.args, done.kept), why: whyFor(chat.exchanges, item) });
    }
    return { run: input.run, outcomes: out, billed: chat.billedUsd, ok: done.call?.ok ?? true, errors: chat.errors };
  });
  const all = outcomes.flatMap((o) => o.outcomes);
  const missing = labels.size - all.length;
  console.log(`replay ${tag}: ${inputs.length} runs, ${all.length} labelled items found${missing ? `, ${missing} labels match no item` : ""}; calls failed in ${outcomes.filter((o) => !o.ok).length} runs; billed $${outcomes.reduce((s, o) => s + o.billed, 0).toFixed(5)}`);
  outcomes.filter((o) => !o.ok).forEach((o) => console.log(`- a call failed in ${o.run}: ${o.errors.join("; ") || "its reply could not be read"}`));
  console.log("\n| items | labelled shown, kept | labelled not shown, dropped |\n|---|---|---|");
  for (const kind of ["criterion", "sentence", "pattern", "all"] as const) {
    const these = all.filter((o) => kind === "all" || o.label.kind === kind);
    const shown = these.filter((o) => o.label.label === "shown");
    const notShown = these.filter((o) => o.label.label === "not_shown");
    console.log(`| ${kind} | ${pct(shown.filter((o) => o.kept).length, shown.length)} | ${pct(notShown.filter((o) => !o.kept).length, notShown.length)} |`);
  }
  const wrong = all.filter((o) => o.label.label === "shown" && !o.kept);
  console.log(`\nLabelled shown and dropped (${wrong.length}):`);
  wrong.forEach((o) => console.log(`- ${o.key.slice(0, 240)}\n    label: ${o.label.reason}\n    verifier: ${o.why ?? "(no reason given)"}`));
  const loose = all.filter((o) => o.label.label === "not_shown" && o.kept);
  console.log(`\nLabelled not shown and kept (${loose.length}):`);
  loose.forEach((o) => console.log(`- ${o.key.slice(0, 240)}\n    label: ${o.label.reason}\n    verifier: ${o.why ?? "(no reason given)"}`));
  const dir = new URL("./closing-replay/", OUT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL(`${tag}.json`, dir), JSON.stringify(all, null, 1));
}
