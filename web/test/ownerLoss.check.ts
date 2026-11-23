import { sql } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { db } from "@/db";
import { processOwner } from "@/db/owner";
import { runs } from "@/db/schema";
import { admitRun } from "@/server/live/admit";
import { newRunId, runsInFlight, type RunMeta } from "@/server/live/store";

const meta = (): RunMeta => ({ id: newRunId(), question: "Find pottery creators", startedAt: new Date().toISOString(), status: "running", error: null, finishedAt: null });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// A process that loses the connection holding its owner lock exits, and admits nothing meanwhile.
// process.exit is replaced here, so the check sees the exit path and keeps the test runner alive.
test("a process whose owner connection is terminated exits non-zero and admits no more questions", async () => {
  vi.stubEnv("RUNS_IN_FLIGHT", "1");
  let exited!: (code: unknown) => void;
  const exit = new Promise<unknown>((resolve) => (exited = resolve));
  vi.spyOn(process, "exit").mockImplementation(((code?: unknown) => exited(code)) as typeof process.exit);

  expect(await admitRun(meta(), "owner_one", "free")).toEqual({ admitted: true });
  expect(await runsInFlight(db())).toBe(1);
  const owner = await processOwner();
  const killed = await db().execute(sql`select pg_terminate_backend(pid) from pg_locks where locktype = 'advisory' and objsubid = 1 and ((classid::bigint << 32) | objid::bigint) = ${owner}`);
  expect(killed).toHaveLength(1);

  expect(await exit).toBe(1);
  await expect(admitRun(meta(), "owner_two", "free")).rejects.toThrow();
  expect(await db().select().from(runs)).toHaveLength(1);
});
