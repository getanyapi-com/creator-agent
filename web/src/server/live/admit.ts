import { sql } from "drizzle-orm";
import type { Allowance } from "@/auth/allowance";
import { claimQuestion } from "@/auth/questionQuota";
import type { Tier } from "@/data/types";
import { db } from "@/db";
import { heldOwner } from "@/db/owner";
import { config } from "@/server/config";
import { houseCapReached } from "./houseSpend";
import { insertRun, runsInFlight, type RunMeta } from "./store";

export type Admission = { admitted: true } | { refused: "none-left"; allowance: Allowance } | { refused: "busy" } | { refused: "house-cap"; tier: Tier };

/**
 * Decides whether a question may start, and if so counts it and saves it as running, all in one transaction
 * under one lock every admission in every process takes, so no two can both take the last place. A process
 * whose owner lock is gone admits nothing, since its runs would not be counted. The house ceilings and the
 * instance's places are checked before the account's count, so a question refused for either is not counted.
 * A wallet question is not counted at all: the two-a-day limit is the free tier's.
 */
export async function admitRun(meta: RunMeta, askerId: string, tier: Tier): Promise<Admission> {
  return db().transaction(async (tx): Promise<Admission> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('admit run'))`);
    const owner = await heldOwner(tx);
    if (await houseCapReached(tx, tier)) return { refused: "house-cap", tier };
    if ((await runsInFlight(tx)) >= config().RUNS_IN_FLIGHT) return { refused: "busy" };
    if (tier === "free") {
      const claim = await claimQuestion(tx, askerId, meta.id);
      if (!claim.allowed) return { refused: "none-left", allowance: claim.allowance };
    }
    await insertRun(tx, meta, askerId, owner, tier);
    return { admitted: true };
  });
}
