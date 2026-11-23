import { describe, expect, it } from "vitest";
import { contactsIn } from "../bench/score/contactDetector.ts";
import { parseHits, secondScan } from "../bench/score/secondScan.ts";
import type { DisplayRun } from "../src/display/types.ts";
import type { ChatModel } from "../src/llm.ts";

const FORMS = ["Instagram ambercreates", "IG 📸 ambercreates", "DM ambercreates on Instagram", "OnlyFans: @amber", "Portfolio: amberstudio . com", "Call 202–555–0187", "Business: a m b e r @ e x a m p l e . c o m", "WhatsApp +٤٤ ٧٧٠٠ ٩٠٠١٢٣"];

describe("the bench's independent detector (round 4, A4)", () => {
  it.each(FORMS)("finds the review's form %j", (form) => {
    expect(contactsIn(form).length).toBeGreaterThan(0);
  });

  it.each(["Remember the buck always stops with you. AI messed this up.", 'Searched "instagram study tips"', "Instagram reels tips for TikTok creators", "Looked at @studyfetch.kendall"])("leaves %j alone", (text) => {
    expect(contactsIn(text)).toEqual([]);
  });
});

describe("the bench's second scan (round 4, A4 and C4)", () => {
  const display = { question: "Find pottery creators", answer: [{ text: "Reach her as ambercreates on another app.", label: "other" }], steps: [], profileUrl: "https://www.tiktok.com/@amber", creators: [{ handle: "stillbecoming.uk" }] } as unknown as DisplayRun;
  const replying = (content: string): ChatModel => ({ complete: async () => ({ content, toolCalls: [], costUsd: 0.00001, finishReason: "stop" }) });

  it("sends every text but the code's links, and reports a hit", async () => {
    let sent = "";
    const llm: ChatModel = {
      complete: async (_m, req) => {
        sent = String(req.messages[1]?.content);
        return { content: '{"hits":[{"index":1,"what":"a username on another app"}]}', toolCalls: [], costUsd: 0.00001, finishReason: "stop" };
      },
    };
    const scan = await secondScan(llm, "second", display);
    expect(sent).not.toContain("tiktok.com");
    expect(sent).toContain('"@stillbecoming.uk"');
    expect(scan.hits).toEqual(['a username on another app in "Reach her as ambercreates on another app..."']);
    expect(scan.failed).toBe(false);
  });

  it("counts an unreadable reply as failed, never as clean", async () => {
    for (const reply of ["not json", '{"hits":[{"index":99}]}']) expect(await secondScan(replying(reply), "second", display)).toMatchObject({ failed: true, hits: [] });
    expect(parseHits('{"hits":[]}', ["a"])).toEqual([]);
  });
});
