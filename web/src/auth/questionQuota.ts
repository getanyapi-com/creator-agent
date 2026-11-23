import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { questionClaims } from "@/db/schema";
import type { Tx } from "@/server/live/store";
import { config } from "@/server/config";
import type { Allowance } from "./allowance";

/**
 * How many questions each account has asked, so a free account gets two a day. A day is lurk's day for a
 * button one user presses: each question counts for 24 hours from when it was asked (lurk's
 * `src/lib/throttle.ts`, the "day" window in `src/lib/tiers.ts`). The count is the account's rows in
 * `question_claims`. `SELF_HOSTED=true` removes the limit.
 */

export const QUESTIONS_PER_DAY = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When none is left, the next opens 24 hours after the question that frees a slot. */
function allowanceOf(recent: Date[]): Allowance {
  const left = Math.max(0, QUESTIONS_PER_DAY - recent.length);
  const freeing = recent[recent.length - QUESTIONS_PER_DAY];
  const opensAt = left > 0 || freeing === undefined ? null : new Date(freeing.getTime() + DAY_MS).toISOString();
  return { limit: QUESTIONS_PER_DAY, left, opensAt };
}

/** The account's questions that still count, oldest first. */
async function counted(tx: Tx, userId: string, now: Date): Promise<Date[]> {
  const rows = await tx
    .select({ at: questionClaims.at })
    .from(questionClaims)
    .where(and(eq(questionClaims.accountId, userId), gt(questionClaims.at, new Date(now.getTime() - DAY_MS))))
    .orderBy(asc(questionClaims.at));
  return rows.map((row) => row.at);
}

/** What this account has left today, for the ask box; null where there is no limit. */
export async function questionAllowance(userId: string, now = new Date()): Promise<Allowance | null> {
  return config().SELF_HOSTED ? null : allowanceOf(await counted(db(), userId, now));
}

/**
 * Counts one question against the account if one is left. Runs inside the transaction that admits the
 * run (`src/server/live/admit.ts`), which holds a lock every admission takes, so two asks at once in
 * any number of processes cannot both take the last question.
 */
export async function claimQuestion(tx: Tx, userId: string, runId: string, now = new Date()): Promise<{ allowed: true } | { allowed: false; allowance: Allowance }> {
  if (config().SELF_HOSTED) return { allowed: true };
  const recent = await counted(tx, userId, now);
  if (allowanceOf(recent).left === 0) return { allowed: false, allowance: allowanceOf(recent) };
  await tx.insert(questionClaims).values({ runId, accountId: userId, at: now });
  return { allowed: true };
}

/** Gives a question back, for a run that ended having spent nothing. */
export async function releaseQuestion(runId: string): Promise<void> {
  await db().delete(questionClaims).where(eq(questionClaims.runId, runId));
}
