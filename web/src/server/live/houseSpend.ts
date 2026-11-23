import { and, eq, sql } from "drizzle-orm";
import { houseSpend } from "@/db/schema";
import type { Tier } from "@/data/types";
import { config } from "@/server/config";
import type { Tx } from "./store";

/**
 * What the house keys spend, by UTC day and kind, and the two daily ceilings on it. Each run owns one row per day
 * and kind it touched, holding an absolute amount, never an increment: a write sets every row of the run to what
 * the run's budget says now, so a repeated or late write leaves the same rows and a failed one is made whole by
 * the next. Data is what AnyAPI billed the house key, which is the published price; a wallet question's data is
 * billed to the asker's wallet and is not here. Model is what Surplus billed, the question's share and any house
 * overage, on every tier. A ceiling is checked before work starts (lurk `src/lib/spend.ts`, `src/lib/usage.ts`).
 */

export type SpendKind = "data" | "model";
export type SpendTotals = Record<SpendKind, number>;

/** A run's spend at one moment, by kind: `spent` as the budget counts it, of which `reserved` is held for calls not yet settled. */
export interface SpendSnapshot {
  spent: SpendTotals;
  reserved: SpendTotals;
}

/** One ledger row: a run's house spend of one kind on one UTC day. */
export interface SpendRow {
  day: string;
  kind: SpendKind;
  usd: number;
}

/** What the house pays for on a tier: both kinds for a free question, only the models for a wallet question. */
export function houseKinds(tier: Tier): SpendKind[] {
  return tier === "free" ? ["data", "model"] : ["model"];
}

/** Midnight UTC starts every daily ceiling over (lurk `src/lib/time.ts`, `utcDayStart`). */
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

const each = (f: (kind: SpendKind) => number): SpendTotals => ({ data: f("data"), model: f("model") });

/**
 * One run's ledger rows, worked out from what its budget says each time it is looked at. The day of the latest
 * look holds everything since the earlier days closed, reservations included, so while the run goes on a row may
 * be high by what is reserved and never low; at the end nothing is reserved and the rows are what was billed.
 * When a look falls on a new UTC day, the previous day closes at what had been billed (settled) by the last look
 * on it; what was reserved then, and anything settled between that look and midnight, falls to the new day.
 */
export class RunSpend {
  readonly #kinds: SpendKind[];
  readonly #closedDays = new Map<string, SpendTotals>();
  #closed: SpendTotals = each(() => 0);
  #day: string | null = null;
  #billed: SpendTotals = each(() => 0);

  constructor(kinds: SpendKind[]) {
    this.#kinds = kinds;
  }

  /** Every row the run has, as of `now` at `at`. */
  rows(now: SpendSnapshot, at = new Date()): SpendRow[] {
    const day = utcDay(at);
    if (this.#day !== null && this.#day !== day) {
      this.#closedDays.set(this.#day, each((kind) => Math.max(0, this.#billed[kind] - this.#closed[kind])));
      this.#closed = this.#billed;
    }
    this.#day = day;
    this.#billed = each((kind) => Math.max(this.#billed[kind], now.spent[kind] - now.reserved[kind]));
    const open = each((kind) => Math.max(0, now.spent[kind] - this.#closed[kind]));
    return [...this.#closedDays, [day, open] as const].flatMap(([d, totals]) => this.#kinds.map((kind) => ({ day: d, kind, usd: totals[kind] })));
  }
}

/** Sets a run's rows to these amounts, in one statement: a row is written whole or not at all, with every other. */
export async function writeSpend(tx: Tx, runId: string, rows: SpendRow[]): Promise<void> {
  if (rows.length === 0) return;
  await tx
    .insert(houseSpend)
    .values(rows.map((row) => ({ day: row.day, kind: row.kind, runId, usd: String(row.usd) })))
    .onConflictDoUpdate({ target: [houseSpend.day, houseSpend.kind, houseSpend.runId], set: { usd: sql`excluded.usd` } });
}

/** What the house has spent today on one kind, across every run. */
async function spentToday(tx: Tx, kind: SpendKind, at: Date): Promise<number> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${houseSpend.usd}), 0)` })
    .from(houseSpend)
    .where(and(eq(houseSpend.day, utcDay(at)), eq(houseSpend.kind, kind)));
  return Number(row?.total ?? 0);
}

/** True once a ceiling this tier's questions spend under (`houseKinds`) has been reached today. */
export async function houseCapReached(tx: Tx, tier: Tier, at = new Date()): Promise<boolean> {
  const { HOUSE_DATA_CAP_USD_PER_DAY, HOUSE_LLM_CAP_USD_PER_DAY } = config();
  const caps: SpendTotals = { data: HOUSE_DATA_CAP_USD_PER_DAY, model: HOUSE_LLM_CAP_USD_PER_DAY };
  for (const kind of houseKinds(tier)) if ((await spentToday(tx, kind, at)) >= caps[kind]) return true;
  return false;
}
