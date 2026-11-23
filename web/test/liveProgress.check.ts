import { expect, test } from "vitest";
import { GET } from "@/app/api/runs/[id]/route";
import { POST } from "@/app/api/runs/route";
import { questionAllowance } from "@/auth/questionQuota";
import { readRun } from "@/server/liveRun";
import { fakeAnyApi, ScriptedModel, services, toolCall } from "../../test/fakes.ts";
import type { ChatModel, ChatRequest } from "../../src/llm.ts";
import { fake, settled } from "./fakeServer";

const QUESTION = "Find pottery creators";
const PLAIN = "pottery wheel";
/** A made-up address written in words, which the pattern cleaner leaves and the final contact gate removes. */
const SPELLED = "someone at example dot test";

/** The contact scan, finding SPELLED wherever it is sent. */
function gate(req: ChatRequest): string {
  const { strings } = JSON.parse(String(req.messages[1]?.content)) as { strings: { index: number; text: string }[] };
  return JSON.stringify({ found: strings.filter((s) => s.text.includes(SPELLED)).map((s) => ({ index: s.index, span: SPELLED })) });
}

test("a live run gives every browser code-built step labels and no search words; the finished run shows the gated ones", async () => {
  fake.user = "asker";
  let runId = "";
  const seen: { stranger: string; asker: string }[] = [];
  const model = new ScriptedModel(
    [() => [toolCall("a", "search_videos", { query: PLAIN }), toolCall("b", "search_videos", { query: SPELLED })], () => [toolCall("f", "finish", { answer: "No creators found." })]],
    0.0002,
    undefined,
    gate,
  );
  // Before the second agent turn, what the run route and the thread page (both readRun) give while the run is in flight,
  // once the searches' progress has been written.
  const peek = async () => {
    const searched = async () => JSON.stringify(await readRun(runId, null)).includes("Searched TikTok");
    while (!(await searched())) await new Promise<void>((resolve) => setImmediate(resolve));
    seen.push({ stranger: JSON.stringify(await readRun(runId, null)), asker: JSON.stringify(await readRun(runId, "asker")) });
  };
  const llm: ChatModel = {
    complete: async (name, request) => {
      if (name === "fake" && model.requests.length === 1) await peek();
      return model.complete(name, request);
    },
  };
  fake.services = services(fakeAnyApi({}).make, llm);
  const started = await POST(new Request("http://check.invalid/api/runs", { method: "POST", body: JSON.stringify({ question: QUESTION }) }));
  runId = ((await started.json()) as { id: string }).id;
  await settled(runId);

  expect(seen).toHaveLength(1);
  for (const view of [seen[0]!.stranger, seen[0]!.asker]) {
    expect(view).toContain('"status":"running"');
    expect(view).toContain("Searched TikTok");
    expect(view).not.toContain(PLAIN);
    expect(view).not.toContain(SPELLED);
  }
  expect(seen[0]!.asker).toContain(QUESTION);

  const finished = await (await GET(new Request(`http://check.invalid/api/runs/${runId}`), { params: Promise.resolve({ id: runId }) })).text();
  expect(finished).toContain('"status":"done"');
  expect(finished).toContain(PLAIN);
  expect(finished).not.toContain(SPELLED);
  // A run that spent money keeps its question counted.
  expect((await questionAllowance("asker"))?.left).toBe(1);
});
