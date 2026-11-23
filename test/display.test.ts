import { describe, expect, it } from "vitest";
import { scanForContacts } from "../bench/score/contactDetector.ts";
import { runAgent } from "../src/agent.ts";
import { toDisplay } from "../src/display/build.ts";
import { mediaLink, pageLink } from "../src/display/links.ts";
import { revealContact } from "../src/display/reveal.ts";
import { toolStep } from "../src/display/steps.ts";
import type { ProgressEvent } from "../src/display/types.ts";
import type { ChatRequest } from "../src/llm.ts";
import { fakeAnyApi, postRow, ScriptedModel, searchRow, services, toolCall, verifierSaying } from "./fakes.ts";

const BIO = "potter | biz: amber.pots (at) example (dot) com | +1 555 010 0199";

function pottery(caption = "Glazing a mug, my pottery studio") {
  return fakeAnyApi({
    "tiktok.search_keyword": () => ({ videos: [searchRow("721", "amber", 340, caption)], nextCursor: null }),
    "tiktok.profile": (body) => ({ handle: body.handle, followers: 812, bio: BIO }),
    "tiktok.profile_videos": (body) => ({ videos: [postRow("722", String(body.handle), 300, 2)] }),
    "tiktok.video_transcript": () => ({ transcript: "WEBVTT 00:00:00.000 --> 00:00:02.000 today we glaze a mug for the shop" }),
  });
}

const search = toolCall("s1", "search_videos", { query: "pottery mugs" });
const inspect = toolCall("i1", "inspect_creator", { handle: "amber" });
const transcript = toolCall("t1", "read_transcript", { video: "721" });
const finish = (extra: Record<string, unknown> = {}) =>
  toolCall("f1", "finish", {
    answer: "@amber glazes mugs.",
    creators: [{ handle: "amber", proof_video_id: "721", criteria: [{ criterion: "makes pottery", state: "supported", evidence_id: "t:721" }] }],
    ...extra,
  });

/** The gate's reply naming each span it finds in the strings it was sent. */
function gateFinding(spans: string[]): (req: ChatRequest) => string {
  return (req) => {
    const strings = (JSON.parse(String(req.messages[1]?.content)) as { strings: { index: number; text: string }[] }).strings;
    const found = spans.flatMap((span) => strings.filter((s) => s.text.includes(span)).map((s) => ({ index: s.index, span })));
    return JSON.stringify({ found });
  };
}

async function run(gate?: (req: ChatRequest) => string, extra: Record<string, unknown> = {}, onProgress?: (e: ProgressEvent) => void) {
  const model = new ScriptedModel([() => [search, inspect], () => [transcript], () => [finish(extra)]], 0.0002, verifierSaying("supported"), gate);
  const out = await runAgent("Find pottery creators", { kind: "free" }, services(pottery().make, model), onProgress);
  return { out, model, display: toDisplay(out) };
}

describe("the display object (round 4, A1)", () => {
  it("is built by the code: no bio text, code-computed creator fields, a short excerpt, and the steps in the code's words", async () => {
    const { display } = await run();
    const text = JSON.stringify(display);
    expect(text).not.toContain("potter |");
    expect(display.creators[0]).toMatchObject({ handle: "amber", followers: 812, hasPublicEmail: true, profileUrl: "https://www.tiktok.com/@amber" });
    expect(display.creators[0]?.criteria[0]).toMatchObject({ source: "claim", state: "supported", evidence: { kind: "transcript", excerpt: "today we glaze a mug for the shop" } });
    expect(display.answer).toEqual([{ text: "@amber glazes mugs.", label: "fact" }]);
    expect(display.steps.map((s) => s.label)).toEqual([
      "Read the limits the question states",
      "Planned the next steps",
      'Searched "pottery mugs"',
      "Looked at @amber",
      "Planned the next steps",
      "Read the words of a video by @amber",
      "Planned the next steps",
      "Wrote the answer",
      "Checked the answer against the evidence",
      "Checked the text for contact details",
    ]);
    expect(display.gate).toBe("model");
    expect(scanForContacts(text)).toEqual([]);
  });

  it("reports one progress event per model turn and per tool call, in the display object's wording, with running cost", async () => {
    const events: ProgressEvent[] = [];
    const { display } = await run(undefined, {}, (e) => events.push(e));
    expect(events.map((e) => e.step.label)).toEqual(display.steps.map((s) => s.label));
    expect(events.every((e) => e.limitUsd === 0.1 && e.spentUsd >= 0)).toBe(true);
    expect(events.at(-1)?.spentUsd).toBeGreaterThan(events[0]?.spentUsd ?? 0);
  });

  it("gives a Reveal the email from the public bio, written plainly, and nothing found elsewhere", async () => {
    const { out } = await run();
    expect(revealContact(out, "@Amber")).toEqual({ handle: "amber", email: "amber.pots@example.com" });
    const api = pottery("mugs, write to shop@example.com");
    const model = new ScriptedModel([() => [search], () => [toolCall("f", "finish", { answer: "Done." })]]);
    const captionOnly = await runAgent("q", { kind: "free" }, services(api.make, model));
    expect(revealContact(captionOnly, "amber").email).toBeNull();
  });
});

describe("the contact gate (round 4, A2)", () => {
  it("replaces every span the scan finds, in every string that holds it", async () => {
    const { display, model } = await run(gateFinding(["glazes"]));
    expect(model.gateRequests).toHaveLength(1);
    expect(display.answer[0]?.text).toBe("@amber [removed] mugs.");
  });

  it("falls back to the pattern cleaner when the scan's reply cannot be read, leaving out captions and excerpts", async () => {
    for (const reply of ["{not json", '{"found":[{"index":0,"span":"not in that string"}]}', '{"found":[{"index":99,"span":"x"}]}']) {
      const { display, out } = await run(() => reply);
      expect(out.gate).toMatchObject({ path: "patterns", reason: "the scan's reply could not be read" });
      expect(display.gate).toBe("patterns");
      expect(display.creators[0]?.proofVideo.caption).toBeNull();
      expect(display.creators[0]?.criteria[0]?.evidence?.excerpt).toBeNull();
      expect(display.answer[0]?.text).toBe("@amber glazes mugs.");
    }
  });

  it("falls back when the scan fails", async () => {
    const { out } = await run(() => {
      throw new Error("down");
    });
    expect(out.gate).toMatchObject({ path: "patterns", reason: "the scan did not answer" });
  });

  it.each(["Instagram ambercreates", "IG 📸 ambercreates", "DM ambercreates on Instagram", "OnlyFans: @amber", "Portfolio: amberstudio . com", "Call 202–555–0187", "Business: a m b e r @ e x a m p l e . c o m", "WhatsApp +٤٤ ٧٧٠٠ ٩٠٠١٢٣"])(
    "keeps the review's contact form %j out of the display object even when the scan finds nothing",
    async (form) => {
      const api = fakeAnyApi({ "tiktok.search_keyword": () => ({ videos: [searchRow("721", "amber", 340, form)] }) });
      const model = new ScriptedModel([() => [search], () => [toolCall("f", "finish", { answer: form, videos: [{ video_id: "721", note: form }] })]]);
      const out = await runAgent("Find pottery creators", { kind: "free" }, services(api.make, model));
      expect(scanForContacts(JSON.stringify(toDisplay(out)))).toEqual([]);
    },
  );

  it.each(["Instagram ambercreates", "Portfolio: amberstudio . com", "Call 202–555–0187", "Business: a m b e r @ e x a m p l e . c o m"])(
    "keeps %j out of a close creator's caption and tile, beside a bio with an email, even when the scan finds nothing",
    async (form) => {
      const api = fakeAnyApi({
        "tiktok.search_keyword": () => ({ videos: [searchRow("721", "amber", 340, `pottery mugs ${form}`)] }),
        "tiktok.profile": (body) => ({ handle: body.handle, followers: 812, bio: BIO }),
      });
      const close = toolCall("f", "finish", { answer: "None fits.", creators: [], close: [{ handle: "amber", proof_video_id: "721" }] });
      const model = new ScriptedModel([() => [search], () => [inspect], () => [close]], 0.0002, verifierSaying("supported"));
      const display = toDisplay(await runAgent("Find pottery creators under 500 followers", { kind: "free" }, services(api.make, model)));
      expect(display.close?.map((c) => [c.handle, c.hasPublicEmail, c.missed])).toEqual([["amber", true, "812 followers, asked for at most 500 followers"]]);
      expect(scanForContacts(JSON.stringify(display))).toEqual([]);
    },
  );
});

describe("step wording", () => {
  it("says a video too long to watch can be read instead, and never shows a tool's error text", () => {
    const call = { name: "inspect_video", args: JSON.stringify({ video: "721" }), startedMs: 5, ms: 9, costUsd: 0.0008, fetched: [] };
    const tooLong = toolStep({ ...call, result: { video: "721", error: "too long to watch", too_long: true } }, (q) => q, () => "amber");
    expect(tooLong).toMatchObject({ label: "Watched a video by @amber", detail: "Too long to watch; its transcript can be read instead", failed: true });
    const failed = toolStep({ ...call, result: { error: "upstream said write to help@example.com" } }, (q) => q, () => "amber");
    expect(JSON.stringify(failed)).not.toContain("example.com");
  });
});

describe("links in the display object (round 4, F2)", () => {
  const email = "booking@example.com";
  const avatar = "https://p16-common-sign.tiktokcdn-us.com/tos-avt/abc~c5.webp?x-expires=1795446000&x-signature=abc";

  it("drops a media link that carries a contact detail, and keeps TikTok's own", () => {
    expect(mediaLink(avatar)).toBe(avatar);
    expect(mediaLink(`${avatar}&contact=${email}`)).toBeNull();
    expect(mediaLink(`${avatar}&contact=booking%40example.com`)).toBeNull();
    expect(mediaLink(`${avatar}#${email}`)).toBeNull();
    expect(mediaLink(`${avatar}&phone=5550100199`)).toBeNull();
    expect(mediaLink("https://example.com/a.jpg")).toBeNull();
    expect(pageLink("https://www.tiktok.com/@amber/video/721")).toBe("https://www.tiktok.com/@amber/video/721");
    expect(pageLink("https://www.tiktok.com/@amber?x=booking@example.com")).toBeNull();
  });

  it("shows no avatar or cover that carries one, and the bench detector flags such a link", async () => {
    const api = fakeAnyApi({
      "tiktok.search_keyword": () => ({ videos: [{ ...searchRow("721", "amber", 340, "Glazing a mug."), image: `${avatar}#${email}` }] }),
      "tiktok.profile": () => ({ handle: "amber", followers: 800, bio: "Pottery.", avatarUrl: `${avatar}&contact=${email}` }),
      "tiktok.profile_videos": () => ({ videos: [postRow("722", "amber", 300, 1)] }),
    });
    const model = new ScriptedModel([() => [search, inspect], () => [toolCall("f", "finish", { answer: "Pottery.", creators: [{ handle: "amber", proof_video_id: "721", criteria: [] }] })]]);
    const display = toDisplay(await runAgent("Find pottery creators", { kind: "free" }, services(api.make, model)));
    expect(display.creators[0]).toMatchObject({ avatarUrl: null, proofVideo: { imageUrl: null } });
    expect(JSON.stringify(display)).not.toContain(email);
    expect(scanForContacts(JSON.stringify({ avatarUrl: `${avatar}&contact=${email}` }))).not.toEqual([]);
    expect(scanForContacts(JSON.stringify({ avatarUrl: avatar }))).toEqual([]);
  });
});

describe("handles that look like domains, and clipped excerpts (round 4, F2, found while measuring)", () => {
  it("keeps a mention of a handle the run holds, and still removes a spaced email that is not one", async () => {
    const h = "artofthepossible.ai";
    const api = fakeAnyApi({
      "tiktok.search_keyword": () => ({ videos: [searchRow("721", h, 340, "Claude tips. booking @example.com")] }),
      "tiktok.profile": () => ({ handle: h, followers: 800, bio: "AI." }),
      "tiktok.profile_videos": () => ({ videos: [postRow("722", h, 300, 1)] }),
    });
    const model = new ScriptedModel([() => [search, toolCall("i", "inspect_creator", { handle: h })], () => [toolCall("f", "finish", { answer: `Like @${h}, these post Claude tips.`, creators: [{ handle: h, proof_video_id: "721", criteria: [] }] })]]);
    const display = toDisplay(await runAgent("Find Claude creators", { kind: "free" }, services(api.make, model)));
    expect(display.answer[0]?.text).toBe(`Like @${h}, these post Claude tips.`);
    expect(display.steps.map((s) => s.label)).toContain(`Looked at @${h}`);
    expect(JSON.stringify(display)).not.toContain("example.com");
    expect(scanForContacts(JSON.stringify(display))).toEqual([]);
  });

  it("never ends an excerpt inside a removed contact", async () => {
    const caption = `${"Three free skills for Claude. ".repeat(3)}Comment DESIGN or go to studio.com now`;
    const api = fakeAnyApi({ "tiktok.search_keyword": () => ({ videos: [searchRow("721", "amber", 340, caption)] }), "tiktok.profile": () => ({ handle: "amber", followers: 800, bio: "AI." }) });
    const model = new ScriptedModel([() => [search, inspect], () => [toolCall("f", "finish", { answer: "Claude tips.", creators: [{ handle: "amber", proof_video_id: "721", criteria: [{ criterion: "posts Claude skills", state: "supported", evidence_id: "721" }] }] })]], 0.0002, verifierSaying("supported"));
    const display = toDisplay(await runAgent("Find Claude creators", { kind: "free" }, services(api.make, model)));
    const excerpt = display.creators[0]?.criteria[0]?.evidence?.excerpt ?? "";
    expect(excerpt.endsWith("go to...")).toBe(true);
    expect(excerpt).not.toContain("[remo");
  });
});

describe("steps name their creator (found while measuring D3)", () => {
  it("carries the handle a step is about, so a looked-at handle like a domain is not read as an email", () => {
    const call = { name: "inspect_creator", args: JSON.stringify({ handle: "stillbecoming.uk" }), result: { followers: 900 }, startedMs: 0, ms: 1, costUsd: 0, fetched: [] };
    const step = toolStep(call, (q) => q, () => null);
    expect(step).toMatchObject({ label: "Looked at @stillbecoming.uk", handle: "stillbecoming.uk" });
    expect(scanForContacts(JSON.stringify({ steps: [step] }))).toEqual([]);
  });
});
