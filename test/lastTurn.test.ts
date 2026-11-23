import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent.ts";
import { lastTurn } from "../src/prompt.ts";
import { fakeAnyApi, ScriptedModel, services, toolCall } from "./fakes.ts";

describe("the last turn names why the research stops (round 7, item 7)", () => {
  it("says the turn limit, not the budget, ended it when money is left", async () => {
    const api = fakeAnyApi({ "tiktok.search_keyword": () => ({ videos: [] }) });
    const search = () => [toolCall("s", "search_videos", { query: "study app", days: 0 })];
    const llm = new ScriptedModel([search], 0.000001);
    await runAgent("Who makes videos about study apps?", { kind: "free" }, services(api.make, llm));
    const last = llm.requests.at(-1)?.messages.at(-1)?.content;
    expect(llm.requests).toHaveLength(8);
    expect(last).toContain("the turn limit ends the research here, not the budget");
    expect(lastTurn(true)).toContain("the budget has no room for more research");
    expect(lastTurn(true)).not.toContain("turn limit");
  });
});
