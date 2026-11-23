import { describe, expect, it } from "vitest";
import { MemoryContactStore } from "../src/contactStore.ts";
import { MemoryEvidenceStore } from "../src/evidence.ts";
import { parseFinish } from "../src/finish/parse.ts";
import { renderAnswer } from "../src/finish/render.ts";
import { validateFinish } from "../src/finish/validate.ts";
import { toCreatorRow, toVideoRow } from "../src/ingest.ts";
import { kept as keptRow, NOW_SEC, postRow, searchRow } from "./fakes.ts";

function storeWithCreator(followers: number | null = 4321) {
  const store = new MemoryEvidenceStore();
  const contacts = new MemoryContactStore();
  for (const row of [searchRow("100", "ann", 250_000, "my GPT-4o study app"), searchRow("200", "bob", 90_000), { ...searchRow("300", "ann", 5_000, ""), region: null }]) {
    const v = toVideoRow(row, "study app", contacts);
    if (v) store.putVideo(v);
  }
  const posts = [postRow("101", "ann", 1000, 1), postRow("102", "ann", 3000, 2), postRow("103", "ann", 2000, 4)];
  const ids = posts.flatMap((p) => {
    const row = toVideoRow(p, null, contacts);
    return row ? [store.putVideo(row).id] : [];
  });
  store.putCreator(keptRow(toCreatorRow({ handle: "ann", followers, bio: "student" }, "ann", contacts, ids)));
  return { store, contacts };
}

const run = { nowSec: NOW_SEC, notFound: [] };
const criterion = (evidence_id: string | null, state = "supported") => ({ criterion: "talks about a study app", state, evidence_id });
const creator = (criteria: unknown[], proof = "100") => ({ answer: "x", creators: [{ handle: "ann", proof_video_id: proof, criteria }] });

describe("validateFinish", () => {
  it("accepts claims whose evidence exists, belongs to the creator and holds text", () => {
    const { store } = storeWithCreator();
    expect(validateFinish(store, parseFinish(creator([criterion("100"), criterion("@ann")])), run).failures).toEqual([]);
  });

  it("rejects a creator whose proof video is missing or by someone else", () => {
    const { store } = storeWithCreator();
    const args = parseFinish({
      answer: "Both.",
      creators: [
        { handle: "ann", proof_video_id: "999", criteria: [] },
        { handle: "ann2", proof_video_id: "200", criteria: [] },
      ],
    });
    const { failures, kept } = validateFinish(store, args, run);
    expect(failures.map((f) => f.reason)).toEqual(["proof video 999 is not in the evidence", "proof video 200 is by @bob, not @ann2"]);
    expect(kept.creators).toEqual([]);
  });

  it("rejects a supported criterion without evidence, with someone else's evidence, or citing evidence with no text", () => {
    const { store } = storeWithCreator();
    const { failures, kept } = validateFinish(store, parseFinish(creator([criterion(null), criterion("200"), criterion("300"), criterion(null, "unknown")])), run);
    expect(failures.map((f) => f.reason)).toEqual([
      "a supported criterion needs an evidence id",
      "evidence 200 belongs to @bob, not @ann",
      expect.stringContaining("evidence 300 holds no text"),
    ]);
    expect(kept.creators[0]?.criteria).toMatchObject([{ criterion: "talks about a study app", state: "unknown", evidence_id: null }]);
  });

  it("rejects a pattern citing fewer than two known videos", () => {
    const { store } = storeWithCreator();
    const args = parseFinish({ answer: "x", creators: [], patterns: [{ pattern: "a hook", video_ids: ["100", "nope"] }] });
    expect(validateFinish(store, args, run).failures).toHaveLength(1);
  });

  it("decides each declared check from evidence on the creator and writes its criterion in words with the figure", () => {
    const { store } = storeWithCreator();
    const checks = [
      { kind: "followers_at_most", value: "10,000", from: "question" },
      { kind: "followers_at_least", value: "10k", from: "assumption" },
      { kind: "proof_views_at_least", value: 100_000, from: "question" },
      { kind: "proof_posted_within_days", value: 30, from: "question" },
      { kind: "proof_region", value: "us", from: "question" },
    ];
    const { failures, kept } = validateFinish(store, parseFinish({ ...creator([criterion("100")]), checks }), run);
    expect(failures).toEqual([]);
    expect(kept.creators[0]?.criteria.map((k) => [k.criterion, k.state, k.evidence_id, k.check?.from ?? null])).toEqual([
      ["talks about a study app", "supported", "100", null],
      ["at most 10,000 followers", "supported", "@ann", "question"],
      ["at least 10,000 followers", "contradicted", "@ann", "assumption"],
      ["proof video at least 100,000 views", "supported", "100", "question"],
      ["proof video posted in the last 30 days", "supported", "100", "question"],
      ["proof video region United States", "supported", "100", "question"],
    ]);
  });

  it("applies one threshold to every creator: a creator who misses a check from the question is left out and counted", () => {
    const { store, contacts } = storeWithCreator();
    const bob = toVideoRow(searchRow("201", "bob", 900), "study app", contacts);
    if (bob) store.putVideo(bob);
    store.putCreator(keptRow(toCreatorRow({ handle: "cat", followers: 50_000, bio: "" }, "cat", contacts, [])));
    const cat = toVideoRow(searchRow("301", "cat", 400_000), "study app", contacts);
    if (cat) store.putVideo(cat);
    const args = parseFinish({
      answer: "x",
      checks: [
        { kind: "proof_views_at_least", value: 100_000, from: "question" },
        { kind: "followers_at_most", value: 10_000, from: "question" },
      ],
      creators: [
        { handle: "ann", proof_video_id: "100", criteria: [] },
        { handle: "bob", proof_video_id: "201", criteria: [] },
        { handle: "cat", proof_video_id: "301", criteria: [] },
      ],
    });
    const { failures, kept } = validateFinish(store, args, run);
    expect(failures).toEqual([]);
    expect(kept.creators.map((c) => c.handle)).toEqual(["ann"]);
    expect(kept.excluded).toEqual({
      count: 2,
      byCheck: [
        { check: "proof video at least 100,000 views", count: 1 },
        { check: "at most 10,000 followers", count: 1 },
      ],
    });
  });

  it("keeps a creator who misses an assumed check, marked, and one whose field is unknown, never zero", () => {
    const { store } = storeWithCreator(0);
    const args = parseFinish({
      ...creator([], "300"),
      checks: [
        { kind: "followers_at_most", value: 10_000, from: "question" },
        { kind: "proof_region", value: "US", from: "question" },
        { kind: "proof_views_at_least", value: 100_000, from: "assumption" },
      ],
    });
    const { kept } = validateFinish(store, args, run);
    expect(kept.creators[0]?.criteria.map((k) => k.state)).toEqual(["unknown", "unknown", "contradicted"]);
    expect(kept.excluded.count).toBe(0);
  });

  it("rejects a check it cannot read, one without its source, and a second check of the same kind", () => {
    const { store } = storeWithCreator();
    const checks = [
      { kind: "followers_under", value: 1, from: "question" },
      { kind: "followers_at_most", value: 10_000 },
      { kind: "proof_views_at_least", value: 100_000, from: "question" },
      { kind: "proof_views_at_least", value: 10_000, from: "question" },
    ];
    const { failures, kept } = validateFinish(store, parseFinish({ ...creator([]), checks }), run);
    expect(failures.map((f) => f.reason)).toEqual([
      expect.stringMatching(/check kind must be one of/),
      "the followers_at_most check must say whether it is from the question or an assumption",
      "declare the proof_views_at_least check once; it applies to every creator",
    ]);
    expect(kept.checks).toEqual([{ kind: "proof_views_at_least", value: 100_000, from: "question" }]);
  });

  it("admits no figure in free text, drops the sentence, but allows a product name with a digit that the evidence holds", () => {
    const { store } = storeWithCreator();
    const args = parseFinish({
      answer: "Ann reviews GPT-4o. She has 4,321 followers. She posts three times a week. Her best video is 7687877955111947551.",
      creators: [{ handle: "ann", proof_video_id: "100", criteria: [] }],
      assumptions: ["Small means under 10K followers.", "Small means a modest following."],
    });
    const { failures, kept } = validateFinish(store, args, run);
    expect(failures.map((f) => f.claim)).toEqual(["answer", "assumption"]);
    expect(kept.answer).toBe("Ann reviews GPT-4o.");
    expect(kept.assumptions).toEqual(["Small means a modest following."]);
  });

  it("rejects a creator named in the text who is not in the evidence, and one the code lists as not found", () => {
    const { store } = storeWithCreator();
    const args = parseFinish({ answer: "Try @ann. Also @madeup.person. And @bob.", creators: [] });
    const { failures, kept } = validateFinish(store, args, { nowSec: NOW_SEC, notFound: ["bob"] });
    expect(failures.map((f) => f.reason)).toEqual([expect.stringContaining("@madeup.person, @bob are not in the evidence")]);
    expect(kept.answer).toBe("Try @ann.");
  });
});

describe("renderAnswer", () => {
  it("writes the criteria line from the declared checks, with their figures and what they left out", () => {
    const { store, contacts } = storeWithCreator();
    const args = validateFinish(
      store,
      parseFinish({
        ...creator([]),
        checks: [
          { kind: "followers_at_most", value: 10_000, from: "question" },
          { kind: "proof_views_at_least", value: 300_000, from: "question" },
          { kind: "proof_posted_within_days", value: 30, from: "assumption" },
        ],
      }),
      run,
    ).kept;
    const answer = renderAnswer({ question: "q", tier: { kind: "free" }, args, store, contacts, nowSec: NOW_SEC, budgetNote: null, notFound: [], finishedBy: "model", dropped: [] });
    expect(answer.creators).toEqual([]);
    expect(answer.criteriaLine).toBe(
      'Checked on every creator, as the agent read the question: at most 10,000 followers; proof video at least 300,000 views. Assumed, not asked (a creator who misses these stays, marked): proof video posted in the last 30 days. Left out 1 creator who misses a check from the question (1 miss "proof video at least 300,000 views").',
    );
    const byCode = renderAnswer({ question: "q", tier: { kind: "free" }, args: { ...args, checksReadBy: "code" }, store, contacts, nowSec: NOW_SEC, budgetNote: null, notFound: [], finishedBy: "model", dropped: [] });
    expect(byCode.criteriaLine?.startsWith("Checked on every creator: at most 10,000 followers;")).toBe(true);
    const none = renderAnswer({ question: "q", tier: { kind: "free" }, args: parseFinish(creator([])), store, contacts, nowSec: NOW_SEC, budgetNote: null, notFound: [], finishedBy: "model", dropped: [] });
    expect(none.criteriaLine).toBeNull();
  });

  it("computes every creator figure from evidence, not from the model", () => {
    const { store, contacts } = storeWithCreator();
    const args = parseFinish({ answer: "x", creators: [{ handle: "ann", proof_video_id: "100", criteria: [] }] });
    const answer = renderAnswer({ question: "q", tier: { kind: "free" }, args, store, contacts, nowSec: NOW_SEC, budgetNote: null, notFound: ["gone"], finishedBy: "model", dropped: [] });
    expect(answer.creators[0]).toMatchObject({
      followers: 4321,
      usualViews: 2000,
      bestRecentViews: 3000,
      proofVsUsualRatio: 125,
      proofVideo: { id: "100", views: 250_000, daysAgo: 3, videoRegion: "US" },
    });
    expect(answer.notFound).toEqual(["gone"]);
  });
});
