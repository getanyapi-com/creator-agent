import { describe, expect, it } from "vitest";
import { verifyFinish } from "../src/closing.ts";
import { Budget } from "../src/budget.ts";
import { MemoryEvidenceStore, type VideoRow } from "../src/evidence.ts";
import { narrativeRequest } from "../src/finish/narrative.ts";
import { parseFinish, type FinishArgs } from "../src/finish/parse.ts";
import { patternHeading } from "../src/finish/patternHeading.ts";
import { subjectContext } from "../src/finish/subjects.ts";
import { claimsRequest } from "../src/finish/verify.ts";
import type { ChatModel, ChatRequest } from "../src/llm.ts";
import { DAY, NOW_SEC, VERIFIER } from "./fakes.ts";

function video(id: string, author: string, views: number, days: number, caption: string): VideoRow {
  return { id, author, url: `https://www.tiktok.com/@${author}/video/${id}`, views, likes: 1, comments: 0, shares: 0, saves: 0, createdUtc: NOW_SEC - days * DAY, region: "US", paidLabel: false, isPinned: false, durationSeconds: 20, caption, hashtags: [], foundBy: [], image: null };
}

/** @toni: 300 followers, usual views 400, a Smiski box at 570,000 views three days ago. @kai: in the evidence, not in the answer. */
function store(): MemoryEvidenceStore {
  const s = new MemoryEvidenceStore();
  const posts = ["11", "12", "13"].map((id, i) => s.putVideo(video(id, "toni", 400, 10 + i, "my dog")));
  s.putVideo(video("1", "toni", 570_000, 3, "Smiski holiday box, a whole set minus the secret one"));
  s.putCreator({ handle: "toni", followers: 300, likes: 1, videoCount: 4, verified: false, bio: "Dad to a shiba.", avatarUrl: null, hasPublicEmail: true, sampledVideoIds: ["1", ...posts.map((p) => p.id)] });
  s.putVideo(video("2", "kai", 9_000, 29, "use ai to get better grades"));
  s.putCreator({ handle: "kai", followers: 9_884, likes: 1, videoCount: 1, verified: false, bio: "Born at a young age.", avatarUrl: null, hasPublicEmail: false, sampledVideoIds: ["2"] });
  return s;
}

const finish = (extra: Record<string, unknown> = {}): FinishArgs =>
  parseFinish({
    answer: "@toni fits.",
    creators: [{ handle: "toni", proof_video_id: "1", criteria: [{ criterion: "The video broke out far above usual views", state: "supported", evidence_id: "@toni" }] }],
    ...extra,
  });

describe("the closing check sees what a careful reader would (round 5)", () => {
  it("gives a claim citing the bio the creator's computed figures, videos and checks, not the bio alone", () => {
    const args = finish();
    args.creators[0]?.criteria.push({ criterion: "at most 10,000 followers", state: "supported", evidence_id: "@toni", check: { kind: "followers_at_most", value: 10_000, from: "question" } });
    const built = claimsRequest(subjectContext(store(), args, NOW_SEC, "q"), args, VERIFIER);
    const body = JSON.parse(String(built?.request.messages[1]?.content)) as { subjects: { creators: Record<string, unknown>[] }; items: { id: string; about: string }[] };
    expect(body.items).toEqual([{ id: "1", about: "@toni", claim: "The video broke out far above usual views", cites: "@toni" }]);
    const toni = body.subjects.creators[0];
    expect(toni).toMatchObject({ handle: "@toni", followers: 300, usual_views: 400, has_public_email: true, checks_applied_by_code: [{ check: "at most 10,000 followers", result: "passes" }] });
    expect(toni?.videos).toEqual(expect.arrayContaining([expect.objectContaining({ id: "1", views: 570_000, days_ago: 3, times_creators_usual_views: 1425 })]));
  });

  it("checks a sentence naming a creator outside the answer, or named by the question, against that creator's evidence", () => {
    const args = finish({ limits_note: "@kai fits the size limit but was left out." });
    const built = narrativeRequest(subjectContext(store(), args, NOW_SEC, "Compare @toni and @kai"), args, VERIFIER, "Compare @toni and @kai");
    const body = JSON.parse(String(built?.request.messages[1]?.content)) as { digest: { creators: Record<string, unknown>[] }; sentences: { id: string; about?: string[] }[] };
    expect(body.digest.creators.map((c) => c.handle)).toEqual(["@toni", "@kai"]);
    expect(body.digest.creators[1]).toMatchObject({ followers: 9_884 });
    expect(body.sentences).toEqual([
      { id: "1", text: "@toni fits.", about: ["@toni"] },
      { id: "2", text: "@kai fits the size limit but was left out.", about: ["@kai"] },
    ]);
  });
});

/** A verifier that answers by item and sentence order, so plain ids map back to the right place. */
function verifier(claims: (n: number) => string, sentence = "shown"): ChatModel {
  return {
    complete: async (_m: string, req: ChatRequest) => {
      const body = JSON.parse(String(req.messages[1]?.content)) as { items?: { id: string }[]; sentences?: { id: string }[] };
      const content = body.sentences
        ? JSON.stringify({ sentences: body.sentences.map((s) => ({ id: s.id, why: "t", kind: sentence, names: [] })) })
        : JSON.stringify({ verdicts: (body.items ?? []).map((i, n) => ({ id: i.id, why: "t", answer: claims(n) })) });
      return { content, toolCalls: null, costUsd: 0, finishReason: "stop" };
    },
  };
}

const run = (args: FinishArgs, llm: ChatModel, question = "q") => verifyFinish({ llm, budget: new Budget(1), prices: { [VERIFIER]: { promptUsd: 0, completionUsd: 0 } }, model: VERIFIER }, store(), args, question, NOW_SEC, 0);

describe("patterns the check cannot confirm (round 5)", () => {
  it("reads a pattern's label, or gives the code's heading", () => {
    expect(patternHeading("Secret pulls: the rare figure drives rewatching")).toBe("Secret pulls");
    expect(patternHeading("Holiday boxes — they dominate this month")).toBe("Holiday boxes");
    expect(patternHeading("Holiday boxes dominate this month.")).toBe("Pattern");
  });

  it("keeps the videos of a pattern under its heading when fewer than two of them show it", async () => {
    const args = finish({ patterns: [{ pattern: "Secret pulls: the rare figure drives rewatching", video_ids: ["1", "2"] }] });
    const done = await run(args, verifier((n) => (n === 0 ? "supported" : "not shown")));
    expect(done.kept.patterns).toEqual([{ pattern: "Secret pulls", video_ids: ["1", "2"] }]);
    const both = await run(args, verifier(() => "supported"));
    expect(both.kept.patterns).toEqual(args.patterns);
  });

  it("maps a verdict given by a plain id back to its claim, and still voids a reply with an id it was not given", async () => {
    const kept = await run(finish(), verifier(() => "supported"));
    expect(kept.kept.creators[0]?.criteria[0]?.state).toBe("supported");
    const wrongId: ChatModel = { complete: async () => ({ content: JSON.stringify({ verdicts: [{ id: "c0.0", why: "t", answer: "supported" }] }), toolCalls: null, costUsd: 0, finishReason: "stop" }) };
    const voided = await run(finish(), wrongId);
    expect(voided.kept.creators[0]?.criteria[0]?.state).toBe("unknown");
  });
});

describe("a closing check whose reply cannot be read asks once more (round 5)", () => {
  const replies = (...contents: (string | Error)[]): { llm: ChatModel; calls: () => number } => {
    let n = 0;
    return {
      calls: () => n,
      llm: {
        complete: async () => {
          const c = contents[Math.min(n, contents.length - 1)];
          n += 1;
          if (c instanceof Error) throw c;
          return { content: c ?? "", toolCalls: null, costUsd: 0, finishReason: "stop" };
        },
      },
    };
  };
  const v = (llm: ChatModel) => ({ llm, budget: new Budget(1), prices: { [VERIFIER]: { promptUsd: 0, completionUsd: 0 } }, model: VERIFIER });
  const req: ChatRequest = { models: [VERIFIER], messages: [], maxTokens: 10, timeoutMs: 10 };
  const read = (c: string): number | null => (c === "ok" ? 1 : null);

  it("uses a second reply when the first is broken, and stops after the second", async () => {
    const { askReadable, READ_TRIES } = await import("../src/finish/askReadable.ts");
    const once = replies("{broken", "ok");
    expect(await askReadable(v(once.llm), req, read)).toMatchObject({ value: 1, ran: true });
    const never = replies("{broken");
    expect(await askReadable(v(never.llm), req, read)).toMatchObject({ value: null, ran: true });
    expect(never.calls()).toBe(READ_TRIES);
    const down = replies(new Error("timeout"));
    expect(await askReadable(v(down.llm), req, read)).toMatchObject({ value: null, ran: false });
    expect(down.calls()).toBe(1);
  });
});
