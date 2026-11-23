import { DrizzleQueryError } from "drizzle-orm";
import { db } from "@/db";
import { writeSpend, type SpendRow } from "./houseSpend";
import { finishRun } from "./store";

type Outcome = Parameters<typeof finishRun>[1];

/** Why a write failed, fit for the server log: never a query's parameters, which carry a run's progress and so words of its question. */
function reason(err: unknown): string {
  const shown = err instanceof DrizzleQueryError ? err.cause : err;
  return shown instanceof Error ? shown.message : "unknown error";
}

/** Logs a failed write of a live run on the server, by run id and what was being written. */
export function logWriteFailure(runId: string, write: "progress" | "spend" | "end" | "give-back", err: unknown): void {
  console.error(`live run ${runId}: the ${write} write failed: ${reason(err)}`);
}

/** Runs this process could not end, each with the attempt that ends it. */
const unfinished = new Map<string, () => Promise<void>>();

/**
 * Ends a running question and sets its final house spend, in one transaction, so a run never looks finished with
 * its spend missing. `then` runs after, only for the call that ended it, so two readers retrying the same end start
 * its follow-up once; its failure is logged. When the transaction fails, the run stays running and the attempt is
 * kept: `retryEnd` makes it again the next time anyone reads the run. Should this process die first, the run is
 * ended as one whose process died.
 */
export async function endRun(runId: string, outcome: Outcome, rows: SpendRow[], then: () => Promise<void>): Promise<void> {
  let ended: boolean;
  try {
    ended = await db().transaction(async (tx) => {
      await writeSpend(tx, runId, rows);
      return finishRun(runId, outcome, tx);
    });
  } catch (err) {
    logWriteFailure(runId, "end", err);
    unfinished.set(runId, () => endRun(runId, outcome, rows, then));
    return;
  }
  unfinished.delete(runId);
  if (ended) await then().catch((err: unknown) => logWriteFailure(runId, "give-back", err));
}

/** Tries again to end every run this process could not end, so none keeps a place among the runs in flight while nobody reads it. */
export async function retryEnds(): Promise<void> {
  for (const attempt of [...unfinished.values()]) await attempt();
}

/** Tries again to end a run this process could not end; true when there was one to try. */
export async function retryEnd(runId: string): Promise<boolean> {
  const attempt = unfinished.get(runId);
  if (attempt === undefined) return false;
  await attempt();
  return true;
}
