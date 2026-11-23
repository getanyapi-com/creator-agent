import { randomBytes } from "node:crypto";
import { and, count, desc, eq, isNull, not, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { ownerAlive } from "@/db/owner";
import { runs } from "@/db/schema";
import type { LiveStatus } from "@/data/live";
import type { Tier } from "@/data/types";
import type { WalletStop } from "@/server/wallet/walletFetch";

/**
 * Every live question is one row of `runs`; nothing here is sent to a browser as is. `record` is the
 * core's private record (`RunOutput`) and is read only by `readRecord`, for Reveal; `display` is the
 * core's display object, the only answer a browser gets; the asker and the removed mark never leave the server.
 * A wallet question is private: `src/server/liveRun.ts` shows it to its asker only, and the front page never lists it.
 */

const ID = /^[0-9a-f]{12}$/;

/** A transaction or the pool: what a write that may be part of a larger transaction runs on. */
export type Tx = Pick<Db, "insert" | "update" | "select" | "execute" | "delete">;

/** The question and where it stands. */
export interface RunMeta {
  id: string;
  question: string;
  startedAt: string;
  status: LiveStatus;
  /** Why a failed run stopped, in plain words. */
  error: string | null;
  finishedAt: string | null;
}

/** A run as the server reads it: its meta, who asked on which tier, its display object and progress, and whether its process still lives. */
export interface StoredRun<Display, Progress> extends RunMeta {
  askerId: string;
  tier: Tier;
  walletStop: WalletStop | null;
  /** False while a finished run's images are still being saved, or were left part-way. */
  mediaSaved: boolean;
  display: Display | null;
  progress: Progress[];
  ownerAlive: boolean;
}

export function isRunId(id: string): boolean {
  return ID.test(id);
}

export function newRunId(): string {
  return randomBytes(6).toString("hex");
}

const iso = (at: Date | null): string | null => (at === null ? null : at.toISOString());

const columns = {
  id: runs.id,
  question: runs.question,
  status: runs.status,
  error: runs.error,
  startedAt: runs.startedAt,
  finishedAt: runs.finishedAt,
  askerId: runs.askerId,
  tier: runs.tier,
  walletStop: runs.walletStop,
  mediaSavedAt: runs.mediaSavedAt,
  display: runs.display,
  progress: runs.progress,
  ownerAlive: ownerAlive(runs.owner),
};

function select() {
  return db().select(columns).from(runs);
}

type Row = Awaited<ReturnType<typeof select>>[number];

function toStored<Display, Progress>({ mediaSavedAt, ...row }: Row): StoredRun<Display, Progress> {
  return {
    ...row,
    mediaSaved: mediaSavedAt !== null,
    startedAt: row.startedAt.toISOString(),
    finishedAt: iso(row.finishedAt),
    display: row.display as Display | null,
    progress: row.progress as Progress[],
  };
}

/** Saves a new running question, owned by this process, inside the transaction that admitted it. */
export async function insertRun(tx: Tx, meta: RunMeta, askerId: string, owner: number, tier: Tier): Promise<void> {
  await tx.insert(runs).values({
    ...meta,
    startedAt: new Date(meta.startedAt),
    finishedAt: null,
    askerId,
    tier,
    owner,
    progress: [],
  });
}

/** A run that is not removed, or null. */
export async function readStoredRun<Display, Progress>(id: string): Promise<StoredRun<Display, Progress> | null> {
  if (!isRunId(id)) return null;
  const [row] = await select().where(and(eq(runs.id, id), isNull(runs.removedAt)));
  return row === undefined ? null : toStored(row);
}

/** Finished public runs that are not removed, newest first, for the front page. */
export async function finishedRuns<Display, Progress>(): Promise<StoredRun<Display, Progress>[]> {
  const rows = await select()
    .where(and(eq(runs.status, "done"), eq(runs.tier, "free"), isNull(runs.removedAt)))
    .orderBy(desc(runs.startedAt));
  return rows.map((row) => toStored<Display, Progress>(row));
}

/** This account's runs that are not removed, newest first, at most `limit` of them, and how many it has in all. */
export async function askedRuns<Display, Progress>(askerId: string, limit: number): Promise<{ runs: StoredRun<Display, Progress>[]; total: number }> {
  const mine = and(eq(runs.askerId, askerId), isNull(runs.removedAt));
  const rows = await select().where(mine).orderBy(desc(runs.startedAt)).limit(limit);
  const [row] = await db().select({ n: count() }).from(runs).where(mine);
  return { runs: rows.map((r) => toStored<Display, Progress>(r)), total: row?.n ?? 0 };
}

/** The core's private record, for Reveal only. */
export async function readRecord<T>(id: string): Promise<T | null> {
  const [row] = await db().select({ record: runs.record }).from(runs).where(eq(runs.id, id));
  return (row?.record ?? null) as T | null;
}

export async function saveProgress(id: string, progress: unknown[]): Promise<void> {
  await db().update(runs).set({ progress }).where(eq(runs.id, id));
}

/** Ends a running question once, in `tx` when given: a run another process already ended is left as it is. */
export async function finishRun(
  id: string,
  outcome: { status: "done" | "failed"; error: string | null; walletStop?: WalletStop | null; record?: unknown; display?: unknown },
  tx: Tx = db(),
): Promise<boolean> {
  const ended = await tx
    .update(runs)
    .set({ ...outcome, finishedAt: new Date() })
    .where(and(eq(runs.id, id), eq(runs.status, "running")))
    .returning({ id: runs.id });
  return ended.length > 0;
}

export async function markRemoved(id: string): Promise<void> {
  await db().update(runs).set({ removedAt: new Date() }).where(eq(runs.id, id));
}

/** Questions being researched now across every process; a run whose process died does not count. */
export async function runsInFlight(tx: Tx): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(runs)
    .where(and(eq(runs.status, "running"), sql`${ownerAlive(runs.owner)}`));
  return row?.n ?? 0;
}

/**
 * Takes over saving a finished run's images when the process that was saving them is gone, for this process,
 * by rewriting `owner` to a live one. The row is locked first, so the update that checks the old owner is dead
 * is a statement of its own and sees the owner a reader before it wrote: of two readers, in one process or two,
 * only the first gets true. (Checked in the update alone, a blocked second reader rechecks against the lock
 * table as it was when it started, finds the old owner still dead, and claims too.)
 */
export async function claimMediaSave(id: string, owner: number): Promise<boolean> {
  return db().transaction(async (tx) => {
    await tx.select({ id: runs.id }).from(runs).where(eq(runs.id, id)).for("update");
    const claimed = await tx
      .update(runs)
      .set({ owner })
      .where(and(eq(runs.id, id), eq(runs.status, "done"), isNull(runs.mediaSavedAt), not(ownerAlive(runs.owner))))
      .returning({ id: runs.id });
    return claimed.length > 0;
  });
}

export async function markMediaSaved(id: string): Promise<void> {
  await db().update(runs).set({ mediaSavedAt: new Date() }).where(eq(runs.id, id));
}
