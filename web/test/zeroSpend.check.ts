import { expect, test } from "vitest";
import { POST } from "@/app/api/runs/route";
import { questionAllowance } from "@/auth/questionQuota";
import { liveThread } from "@/data/liveThread";
import { readRun } from "@/server/liveRun";
import { fakeAnyApi, services } from "../../test/fakes.ts";
import { ModelCallError } from "../../src/llm.ts";
import { fake, settled } from "./fakeServer";

test("a run the core finishes having spent nothing gives the question back and says nothing was spent", async () => {
  fake.user = "outage_account";
  // The marketplace refuses every model call before it runs, so the core returns a forced answer that cost nothing.
  fake.services = services(fakeAnyApi({}).make, { complete: () => Promise.reject(new ModelCallError("not run", 429)) });
  const started = await POST(new Request("http://check.invalid/api/runs", { method: "POST", body: JSON.stringify({ question: "Find pottery creators" }) }));
  const { id } = (await started.json()) as { id: string };
  await settled(id);

  const run = await readRun(id, fake.user);
  expect(run?.status).toBe("failed");
  expect((await questionAllowance(fake.user))?.left).toBe(2);
  expect(liveThread(run!).answer.map((s) => s.text)).toEqual(["The research could not start. Nothing was spent."]);
});
