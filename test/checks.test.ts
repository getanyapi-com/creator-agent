import { describe, expect, it } from "vitest";
import { scanForContacts } from "../bench/score/contactDetector.ts";
import { autoChecks } from "../bench/score/checks.ts";
import type { SavedRun } from "../bench/questions.ts";
import { runAgent } from "../src/agent.ts";
import { fakeAnyApi, postRow, ScriptedModel, searchRow, services, toolCall } from "./fakes.ts";

const AVATAR = "https://p16-common-sign.tiktokcdn-us.com/tos-avt/a~tplv-tiktokx-cropcenter:1080:1080.webp?x-expires=1792148400&x-signature=abc%3D";

async function savedRun(finishArgs: Record<string, unknown>, inspect = false): Promise<SavedRun> {
  const api = fakeAnyApi({
    "tiktok.search_keyword": () => ({ videos: [searchRow("100", "ann", 250_000), searchRow("200", "bob", 90_000)] }),
    "tiktok.profile": (body) => ({ handle: body.handle, followers: 4321, bio: "student", avatarUrl: AVATAR }),
    "tiktok.profile_videos": (body) => ({ videos: [postRow("101", String(body.handle), 1000, 1)] }),
  });
  const research = [toolCall("s", "search_videos", { query: "study app" }), ...(inspect ? [toolCall("i", "inspect_creator", { handle: "ann" })] : [])];
  const model = new ScriptedModel([() => research, () => [toolCall("f", "finish", finishArgs)]]);
  const output = await runAgent("Find study creators", { kind: "free" }, services(api.make, model));
  return { questionId: "q", mode: "agent", tier: { kind: "free" }, repeat: 1, startedAt: "2026-11-20T00:00:00.000Z", output, error: null };
}

describe("autoChecks", () => {
  const args = { answer: "Bob's video.", creators: [], videos: [{ video_id: "200", note: "a study video" }] };

  it("passes a clean run", async () => {
    const saved = await savedRun(args);
    expect(autoChecks(saved)).toMatchObject({ idsResolve: true, figuresMatch: true, noContact: true });
  });

  it("checks the figures on standalone videos against the evidence", async () => {
    const saved = await savedRun(args);
    const video = saved.output?.answer.videos[0];
    if (video) video.views = 1_000_000;
    expect(autoChecks(saved).figuresMatch).toBe(false);
  });

  it("re-decides the declared checks from the evidence, so an edited check state fails", async () => {
    const withChecks = {
      answer: "Ann fits.",
      checks: [{ kind: "followers_at_most", value: 10_000, from: "question" }],
      creators: [{ handle: "ann", proof_video_id: "100", criteria: [] }],
    };
    const saved = await savedRun(withChecks, true);
    expect(autoChecks(saved)).toMatchObject({ idsResolve: true, figuresMatch: true, noContact: true });
    const checked = saved.output?.answer.creators[0]?.criteria[0];
    expect(checked).toMatchObject({ criterion: "at most 10,000 followers", state: "supported" });
    if (checked) checked.state = "contradicted";
    expect(autoChecks(saved).figuresMatch).toBe(false);
  });

  it("keeps a content claim the verifier set to unknown as saved, with its cited evidence id", async () => {
    const claim = { criterion: "talks about a study app", state: "supported", evidence_id: "100" };
    const saved = await savedRun({ answer: "Ann fits.", creators: [{ handle: "ann", proof_video_id: "100", criteria: [claim] }] }, true);
    expect(saved.output?.answer.creators[0]?.criteria[0]).toMatchObject({ state: "unknown", evidenceId: "100" });
    expect(autoChecks(saved).figuresMatch).toBe(true);
  });

  it("sets aside TikTok image links in the two media fields, and nothing else", async () => {
    const saved = await savedRun({ answer: "Ann fits.", creators: [{ handle: "ann", proof_video_id: "100", criteria: [] }] }, true);
    const c = saved.output?.answer.creators[0];
    expect(c?.avatarUrl).toMatch(/^https:\/\/p16-common-sign\.tiktokcdn-us\.com\//);
    expect(autoChecks(saved).noContact).toBe(true);
    if (c) c.avatarUrl = "https://evil.example/a.jpg";
    // The display object drops a media link that is not on TikTok's image hosts (round 4, F2); the detector flags one anyway.
    expect(autoChecks(saved).noContact).toBe(true);
    expect(scanForContacts(JSON.stringify({ avatarUrl: "https://evil.example/a.jpg" }))).not.toEqual([]);
  });

  it("scans the display object, not the private record (round 4, A4)", async () => {
    const saved = await savedRun(args);
    const call = saved.output?.calls[0];
    if (call) call.error = "upstream said: write to ops@example.com";
    expect(autoChecks(saved).noContact).toBe(true);
    if (saved.output) saved.output.answer.criteriaLine = "Checked on every creator: write to ops@example.com";
    expect(autoChecks(saved).noContact).toBe(false);
  });
});

describe("autoChecks on a code-written answer (round 4, F5)", () => {
  it("does not read the figures of a failure the code wrote as model text", async () => {
    const saved = await savedRun({ answer: "Ann fits.", creators: [{ handle: "ann", proof_video_id: "100", criteria: [] }] }, true);
    if (!saved.output) throw new Error("no run");
    saved.output.answer = { ...saved.output.answer, creators: [], finishedBy: "unconfirmed", directAnswer: "It spent $0.0021 of the $0.10 limit." };
    expect(autoChecks(saved).figuresMatch).toBe(true);
  });
});
