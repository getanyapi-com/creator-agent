import { expect, test } from "vitest";
import { questionAllowance } from "@/auth/questionQuota";
import { admitRun } from "@/server/live/admit";
import { newRunId, type RunMeta } from "@/server/live/store";

const meta = (): RunMeta => ({ id: newRunId(), question: "Find pottery creators", startedAt: new Date().toISOString(), status: "running", error: null, finishedAt: null });

// Each admission is a transaction on its own pooled connection, so these race in Postgres exactly as asks from separate processes would.
test("ten asks at once from one account take exactly the two questions it has", async () => {
  const outcomes = await Promise.all(Array.from({ length: 10 }, () => admitRun(meta(), "racing_account", "free")));
  expect(outcomes.filter((o) => "admitted" in o)).toHaveLength(2);
  // The two admitted are still running, so the rest are refused as questions at once, before the count.
  expect(outcomes.filter((o) => "refused" in o && o.refused === "at-once")).toHaveLength(8);
  expect((await questionAllowance("racing_account"))?.left).toBe(0);
});

test("with one question left, two asks at once take it once", async () => {
  expect("admitted" in (await admitRun(meta(), "last_one", "free"))).toBe(true);
  const outcomes = await Promise.all([admitRun(meta(), "last_one", "free"), admitRun(meta(), "last_one", "free")]);
  expect(outcomes.filter((o) => "admitted" in o)).toHaveLength(1);
});
