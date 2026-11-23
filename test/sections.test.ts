import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent.ts";
import { toDisplay } from "../src/display/build.ts";
import { settleSections, type FinishSection } from "../src/finish/sections.ts";
import type { ChatRequest } from "../src/llm.ts";
import { fakeAnyApi, postRow, ScriptedModel, searchRow, services, toolCall } from "./fakes.ts";

const scope = { handles: ["amber", "ben", "cara"], videoIds: new Set(["1", "2", "3"]) };
const s = (kind: FinishSection["kind"], members: string[], reason = "Why."): FinishSection => ({ kind, heading: `${kind} heading`, reason, members });

describe("settling sections against the final answer (round 4, E1)", () => {
  it("keeps the model's order and reasons when they hold", () => {
    expect(settleSections([s("best", ["@amber"]), s("group", ["@ben", "@cara"]), s("pattern", ["1", "2"])], scope)).toEqual([
      { kind: "best", heading: "best heading", reason: "Why.", handles: ["amber"], videoIds: [] },
      { kind: "group", heading: "group heading", reason: "Why.", handles: ["ben", "cara"], videoIds: [] },
      { kind: "pattern", heading: "pattern heading", reason: "Why.", handles: [], videoIds: ["1", "2"] },
    ]);
  });

  it("drops members not in the answer, places a creator once, and appends creators left out to a final group with no reason", () => {
    const got = settleSections([s("best", ["@amber", "@zed"]), s("group", ["@amber", "@ben"]), s("pattern", ["1", "99"])], scope);
    expect(got.map((x) => [x.kind, x.handles, x.videoIds, x.reason])).toEqual([
      ["best", ["amber"], [], "Why."],
      ["group", ["ben"], [], "Why."],
      ["pattern", [], ["1"], "Why."],
      ["group", ["cara"], [], null],
    ]);
  });

  it("has exactly one best section with one creator: a second best becomes a group, extra creators move out, and with none the first creator is promoted", () => {
    const two = settleSections([s("best", ["@amber", "@ben"]), s("best", ["@cara"])], scope);
    expect(two.map((x) => [x.kind, x.handles])).toEqual([["best", ["amber"]], ["group", ["ben"]], ["group", ["cara"]]]);
    const none = settleSections([s("group", ["@ben", "@amber"], "Both glaze.")], scope);
    expect(none.map((x) => [x.kind, x.handles, x.reason])).toEqual([["best", ["ben"], null], ["group", ["amber"], "Both glaze."], ["group", ["cara"], null]]);
    expect(settleSections([], { handles: [], videoIds: new Set() })).toEqual([]);
  });
});

function verifier(req: ChatRequest): string {
  const body = JSON.parse(String(req.messages[1]?.content)) as { sentences?: { id: string; text: string }[] };
  if (!body.sentences) return '{"verdicts":[]}';
  return JSON.stringify({ sentences: body.sentences.map((x) => ({ id: x.id, why: "t", kind: /surgeon/.test(x.text) ? "not_shown" : "shown", names: [] })) });
}

async function run(finish: Record<string, unknown>) {
  const api = fakeAnyApi({
    "tiktok.search_keyword": () => ({ videos: [searchRow("1", "amber", 900, "Glazing a mug."), searchRow("2", "ben", 800, "Throwing a bowl.")] }),
    "tiktok.profile": (b) => ({ handle: b.handle, followers: 700, bio: "Pottery." }),
    "tiktok.profile_videos": (b) => ({ videos: [postRow(b.handle === "amber" ? "11" : "12", String(b.handle), 100, 2)] }),
  });
  const creators = [{ handle: "amber", proof_video_id: "1", criteria: [] }, { handle: "ben", proof_video_id: "2", criteria: [] }];
  const model = new ScriptedModel(
    [() => [toolCall("s", "search_videos", { query: "pottery" }), toolCall("i", "inspect_creator", { handle: "amber" }), toolCall("j", "inspect_creator", { handle: "ben" })], () => [toolCall("f", "finish", { creators, ...finish })], () => [toolCall("f", "finish", { creators, ...finish })]],
    0.000001,
    verifier,
  );
  return runAgent("Find pottery creators", { kind: "free" }, services(api.make, model));
}

describe("sections through the run (round 4, E1 to E3)", () => {
  it("carries the sections in the display object with each member's code-computed figures", async () => {
    const out = await run({ answer: "Potters fit; the best glazes on camera.", sections: [{ kind: "best", heading: "Glazes on camera", reason: "@amber glazes a mug.", members: ["@amber"] }, { kind: "group", heading: "Also throws", reason: "@ben throws bowls.", members: ["@ben"] }, { kind: "pattern", heading: "Process shots", reason: "Both show the making.", members: ["1", "2"] }] });
    const d = toDisplay(out);
    expect(d.sections.map((x) => [x.kind, x.heading, x.reason, x.creators.map((c) => c.handle), x.videoIds])).toEqual([
      ["best", "Glazes on camera", "@amber glazes a mug.", ["amber"], []],
      ["group", "Also throws", "@ben throws bowls.", ["ben"], []],
      ["pattern", "Process shots", "Both show the making.", [], ["1", "2"]],
    ]);
    expect(d.sections[0]?.creators[0]).toEqual(d.creators.find((c) => c.handle === "amber"));
    expect(d.sections[2]?.videos.map((v) => v.views)).toEqual([900, 800]);
  });

  it("drops a reason the evidence does not show and keeps the section's members; a heading with a figure gets the code's heading", async () => {
    const out = await run({ answer: "Potters fit.", sections: [{ kind: "best", heading: "Top 1 pick", reason: "@amber is a licensed surgeon.", members: ["@amber"] }] });
    const d = toDisplay(out);
    expect(d.sections[0]).toMatchObject({ kind: "best", heading: "Best fit", reason: null });
    expect(d.sections[0]?.creators.map((c) => c.handle)).toEqual(["amber"]);
    expect(d.sections[1]).toMatchObject({ kind: "group", heading: "Also fit", reason: null });
  });

  it("drops a direct-answer sentence that lists the creators when the answer has sections", async () => {
    const out = await run({ answer: "Potters fit. They are @amber and @ben.", sections: [{ kind: "best", heading: "Glazes", reason: "@amber glazes a mug.", members: ["@amber"] }] });
    expect(out.answer.directAnswer).toBe("Potters fit.");
    expect(out.answer.droppedClaims.some((c) => c.reason.includes("the sections show them"))).toBe(true);
  });
});

describe("fixes after the final measurement (round 4)", () => {
  it("keeps the handle list out of the summary even when the model wrote no sections", async () => {
    const out = await run({ answer: "Potters fit. They are @amber and @ben." });
    expect(out.answer.directAnswer).toBe("Potters fit.");
  });

  it("sends a section's reason to the verifier with the creators it is about, and its heading not at all", async () => {
    const seen: { text: string; about?: string[] }[] = [];
    const api = fakeAnyApi({ "tiktok.search_keyword": () => ({ videos: [searchRow("1", "amber", 900, "Glazing a mug.")] }) });
    const verifier = (req: ChatRequest): string => {
      const body = JSON.parse(String(req.messages[1]?.content)) as { sentences?: { id: string; text: string; about?: string[] }[] };
      seen.push(...(body.sentences ?? []));
      return JSON.stringify(body.sentences ? { sentences: body.sentences.map((x) => ({ id: x.id, why: "t", kind: "shown", names: [] })) } : { verdicts: [] });
    };
    const finish = { answer: "Potters fit.", creators: [{ handle: "amber", proof_video_id: "1", criteria: [] }], sections: [{ kind: "best", heading: "Glazes on camera", reason: "Glazes mugs.", members: ["@amber"] }] };
    const model = new ScriptedModel([() => [toolCall("s", "search_videos", { query: "pottery" })], () => [toolCall("f", "finish", finish)]], 0.000001, verifier);
    const d = toDisplay(await runAgent("Find pottery creators", { kind: "free" }, services(api.make, model)));
    expect(seen.find((x) => x.text === "Glazes mugs.")?.about).toEqual(["@amber"]);
    expect(seen.some((x) => x.text === "Glazes on camera")).toBe(false);
    expect(d.sections[0]).toMatchObject({ heading: "Glazes on camera", reason: "Glazes mugs." });
  });
});

describe("the narrative check sees what the code computed (round 4, E1)", () => {
  it("puts each creator's followers, usual views and pace in the verifier's digest, so a reason comparing reach can be checked", async () => {
    const digests: string[] = [];
    const api = fakeAnyApi({ "tiktok.search_keyword": () => ({ videos: [searchRow("1", "amber", 900)] }), "tiktok.profile": () => ({ handle: "amber", followers: 700, bio: "Pottery." }) });
    const model = new ScriptedModel([() => [toolCall("s", "search_videos", { query: "x" }), toolCall("i", "inspect_creator", { handle: "amber" })], () => [toolCall("f", "finish", { answer: "Potters fit.", creators: [{ handle: "amber", proof_video_id: "1", criteria: [] }] })]], 0.000001, (req) => {
      digests.push(String(req.messages[1]?.content));
      const body = JSON.parse(String(req.messages[1]?.content)) as { sentences?: { id: string }[] };
      return JSON.stringify(body.sentences ? { sentences: body.sentences.map((x) => ({ id: x.id, why: "t", kind: "shown", names: [] })) } : { verdicts: [] });
    });
    await runAgent("Find pottery creators", { kind: "free" }, services(api.make, model));
    const digest = JSON.parse(digests.find((d) => d.includes('"sentences"')) ?? "{}") as { digest?: { creators?: { followers?: number }[] } };
    expect(digest.digest?.creators?.[0]?.followers).toBe(700);
  });
});
