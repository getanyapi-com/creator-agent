import { describe, expect, it } from "vitest";
import { MemoryEvidenceStore, type VideoRow } from "../src/evidence.ts";
import { withCodeSentences } from "../src/finish/fallbacks.ts";
import { parseFinish, type FinishArgs } from "../src/finish/parse.ts";
import { renderAnswer } from "../src/finish/render.ts";
import { MemoryContactStore } from "../src/contactStore.ts";
import { autoChecks } from "../bench/score/checks.ts";
import type { RunOutput } from "../src/trace.ts";
import { DAY, NOW_SEC } from "./fakes.ts";

const v = (id: string, author: string): VideoRow => ({ id, author, url: `https://www.tiktok.com/@${author}/video/${id}`, views: 1000, likes: 1, comments: 0, shares: 0, saves: 0, createdUtc: NOW_SEC - DAY, region: "US", paidLabel: false, isPinned: false, durationSeconds: 20, caption: "a study skit", hashtags: [], foundBy: [], image: null });

function store(): MemoryEvidenceStore {
  const s = new MemoryEvidenceStore();
  ["7687877955111947551:kendall.k", "2:karen", "3:astn"].forEach((x) => {
    const [id = "", author = ""] = x.split(":");
    s.putVideo(v(id, author));
  });
  return s;
}

const creators = [
  { handle: "karen", proof_video_id: "2", criteria: [] },
  { handle: "astn", proof_video_id: "3", criteria: [] },
];
const args = (raw: Record<string, unknown>): FinishArgs => parseFinish(raw);
const after = (a: FinishArgs, answer: string): FinishArgs => ({ ...a, answer });

describe("an answer the closing check cut is never left broken (round 5)", () => {
  it("says how many creators met the question's checks when no sentence of the answer is left", () => {
    const before = { ...args({ answer: "They broke out.", creators }), checks: [{ kind: "followers_at_most" as const, value: 10_000, from: "question" as const }] };
    const out = withCodeSentences(before, after(before, ""), store(), "Find creators under 10,000 followers");
    expect(out.answer).toBe("2 creators meet every check the question set; the reasons are in the sections below.");
    expect(out.labels[out.answer]).toBe("fact");
    expect(out.codeSentences).toEqual([out.answer]);
    const noChecks = args({ answer: "They fit.", creators: creators.slice(0, 1) });
    expect(withCodeSentences(noChecks, after(noChecks, ""), store(), "Find creators").answer).toBe("The answer lists 1 creator; the reasons are in the sections below.");
    const patternsOnly = args({ answer: "Hooks.", patterns: [{ pattern: "Skits", video_ids: ["2", "3"] }] });
    expect(withCodeSentences(patternsOnly, after(patternsOnly, ""), store(), "What hooks work?").answer).toBe("The answer found 1 pattern; the videos that show it are below.");
  });

  it("names the video a why-did-this-work answer is about when its pick sentence was cut", () => {
    const q = "Why did this video do well? https://www.tiktok.com/@kendall.k/video/7687877955111947551";
    const before = args({ answer: "Kendall's video rode a trend. The reveal plugs the app." });
    const out = withCodeSentences(before, after(before, "The reveal plugs the app."), store(), q);
    expect(out.answer).toBe("This answer is about the video 7687877955111947551 by @kendall.k. The reveal plugs the app.");
    const kept = withCodeSentences(before, after(before, "@kendall.k's video rode a trend."), store(), q);
    expect(kept.codeSentences).toEqual([]);
  });

  it("names the best fit of a comparison when its pick sentence was cut", () => {
    const q = "Compare @karen and @astn: who is the best fit?";
    const before = args({ answer: "@karen is the best fit. Both post study skits.", creators, sections: [{ kind: "best", heading: "Best", reason: "", members: ["@karen"] }] });
    const out = withCodeSentences(before, after(before, "Both post study skits."), store(), q);
    expect(out.answer).toBe("Of the creators compared, the answer's best fit is @karen. Both post study skits.");
    expect(withCodeSentences(before, before, store(), q).codeSentences).toEqual([]);
  });

  it("is not read by the bench as model text with figures", () => {
    const s = store();
    const before = args({ answer: "They fit.", creators });
    const a = withCodeSentences(before, after(before, ""), s, "Find creators");
    const answer = renderAnswer({ question: "Find creators", tier: { kind: "free" }, args: a, store: s, contacts: new MemoryContactStore(), nowSec: NOW_SEC, budgetNote: null, notFound: [], finishedBy: "model", dropped: [] });
    const output = { answer, evidence: s.snapshot(), trace: [], evidenceIndex: {}, costs: { limitUsd: 0.1, dataUsd: 0, modelUsd: 0, totalUsd: 0, houseUsd: 0, dataCalls: 0, refusedCalls: 0 }, calls: [], wallMs: 0, nowSec: NOW_SEC, modelTurns: 1, contactsFound: 0, contacts: {}, verify: null, intake: { status: "failed", checks: [], wanted: null, rejected: [], call: null }, gate: { path: "patterns", reason: null, removed: [], call: null } } as unknown as RunOutput;
    const checks = autoChecks({ questionId: "x", mode: "agent", tier: { kind: "free" }, repeat: 1, startedAt: "", output, error: null });
    expect(answer.directAnswer).toContain("The answer lists 2 creators");
    expect(checks.figuresMatch).toBe(true);
  });
});
