import type { Services } from "../../src/index.ts";
import { readStoredRun } from "@/server/live/store";

/** What the mocked Clerk session and house services (test/setup.ts) give the code under check; each check sets it. */
export const fake: { user: string | null; services: Services | null } = { user: null, services: null };

/** Resolves once a started run has stopped, asking the database between turns of the event loop; nothing here sleeps. */
export async function settled(runId: string): Promise<void> {
  while ((await readStoredRun(runId))?.status === "running") await new Promise<void>((resolve) => setImmediate(resolve));
}
