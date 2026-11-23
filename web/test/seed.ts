import { db } from "@/db";
import { processOwner } from "@/db/owner";
import { runs } from "@/db/schema";

/** An owner number no process holds: a run owned by it is one whose process died. */
export const DEAD_OWNER = 1;

/** Saves a run row as the app would have, for a check that needs one in a given state. */
export async function seedRun(row: { id: string; status: "running" | "done" | "failed"; askerId?: string; owner?: number; display?: unknown; record?: unknown }): Promise<void> {
  const now = new Date();
  await db()
    .insert(runs)
    .values({
      question: "Find creators",
      startedAt: now,
      finishedAt: row.status === "running" ? null : now,
      progress: [],
      askerId: "someone",
      owner: row.owner ?? (await processOwner()),
      ...row,
    });
}
