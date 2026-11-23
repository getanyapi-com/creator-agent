import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent.ts";
import { MemoryContactStore } from "../src/contactStore.ts";
import { toDisplay } from "../src/display/build.ts";
import { MemoryEvidenceStore } from "../src/evidence.ts";
import { decideCheck, type Check } from "../src/finish/checks.ts";
import { admitClose, missLabel, TOPIC_CRITERION } from "../src/finish/close.ts";
import { parseFinish } from "../src/finish/parse.ts";
import { validateFinish } from "../src/finish/validate.ts";
import { toCreatorRow, toVideoRow } from "../src/ingest.ts";
import type { ChatRequest } from "../src/llm.ts";
import { CLOSE_HINT } from "../src/tools/inspectCreator.ts";
import { DAY, fakeAnyApi, kept, NOW_SEC, ScriptedModel, searchRow, services, toolCall, verifierSaying } from "./fakes.ts";

const q = (kind: Check["kind"], value: number | string): Check => ({ kind, value, from: "question" });
const NARROW: Check[] = [q("followers_at_most", 10_000), q("proof_views_at_least", 100_000), q("proof_posted_within_days", 30), q("proof_region", "US")];

/** One creator with one search row; each argument overrides what would meet every limit of NARROW. */
function evidence(rows: Record<string, unknown>[], followers: Record<string, number | null>) {
  const store = new MemoryEvidenceStore();
  const contacts = new MemoryContactStore();
  for (const row of rows) {
    const v = toVideoRow(row, "study app", contacts);
    if (v) store.putVideo(v);
  }
  for (const [handle, count] of Object.entries(followers)) store.putCreator(kept(toCreatorRow({ handle, followers: count, bio: "student" }, handle, contacts, [])));
  return store;
}

const facts = (store: MemoryEvidenceStore, checks = NARROW, exact: string[] = []) => ({ store, checks, nowSec: NOW_SEC, exact: new Set(exact) });
const nominee = (handle: string, proof: string) => ({ handle, proof_video_id: proof, evidence_id: null });

describe("admitting a close creator (exactly one of the question's limits missed, decided by the code)", () => {
  it("admits a creator who misses one limit and meets every other, with the code's label and the topic as a criterion", () => {
    const store = evidence([searchRow("1", "big", 250_000, "my AI study app")], { big: 14_200 });
    const { close, notes } = admitClose(facts(store), [nominee("big", "1")]);
    expect(notes).toEqual([]);
    expect(close).toHaveLength(1);
    expect(close[0]?.missed).toBe("14,200 followers, asked for at most 10,000 followers");
    expect(close[0]?.criteria[0]).toEqual({ criterion: TOPIC_CRITERION, state: "supported", evidence_id: "1", check: null });
    expect(close[0]?.criteria.filter((k) => k.state === "contradicted").map((k) => k.criterion)).toEqual(["at most 10,000 followers"]);
  });

  it("refuses a creator who misses two limits", () => {
    const store = evidence([searchRow("1", "big", 50_000)], { big: 14_200 });
    const { close, notes } = admitClose(facts(store), [nominee("big", "1")]);
    expect(close).toEqual([]);
    expect(notes[0]?.reason).toContain("misses 2 of the question's limits");
  });

  it("refuses a creator with a limit that cannot be decided: known only from a search row, its followers are unknown", () => {
    const store = evidence([searchRow("1", "row", 50_000)], {});
    const { close, notes } = admitClose(facts(store), [nominee("row", "1")]);
    expect(close).toEqual([]);
    expect(notes[0]?.reason).toBe('not shown as close: "at most 10,000 followers" could not be decided');
  });

  it("does not count an assumption as a limit: missing only an assumption is no miss, and an assumption missed beside one limit does not refuse", () => {
    const store = evidence([searchRow("1", "fit", 250_000), searchRow("2", "big", 250_000)], { fit: 400, big: 14_200 });
    const checks = [...NARROW, { kind: "followers_at_least", value: 1000, from: "assumption" } as Check];
    const { close, notes } = admitClose(facts(store, checks), [nominee("fit", "1"), nominee("big", "2")]);
    expect(notes.map((n) => n.claim)).toEqual(["close @fit"]);
    expect(notes[0]?.reason).toContain("misses 0 of the question's limits");
    expect(close.map((c) => c.handle)).toEqual(["big"]);
  });

  it("never takes an exact creator, a proof video by someone else, or topic text that is not the creator's", () => {
    const store = evidence([searchRow("1", "big", 250_000), searchRow("2", "other", 250_000)], { big: 14_200, other: 20_000 });
    const nominated = [nominee("big", "1"), nominee("other", "1"), { handle: "other", proof_video_id: "2", evidence_id: "1" }];
    const { close, notes } = admitClose(facts(store, NARROW, ["big"]), nominated);
    expect(close).toEqual([]);
    expect(notes.map((n) => n.reason)).toEqual(["not shown as close: proof video 1 is by @big"]);
  });
});

describe("the missed limit's label, written by the code with the limit worded as the criteria line words it", () => {
  const store = evidence([{ ...searchRow("1", "ann", 61_000), createdUtc: NOW_SEC - 41 * DAY, region: "CA" }], { ann: 14_200 });
  const label = (check: Check) => missLabel(check, decideCheck(store, "ann", "1", check, NOW_SEC));
  it.each([
    [q("followers_at_most", 10_000), "14,200 followers, asked for at most 10,000 followers"],
    [q("followers_at_least", 20_000), "14,200 followers, asked for at least 20,000 followers"],
    [q("proof_views_at_least", 100_000), "proof video 61,000 views, asked for proof video at least 100,000 views"],
    [q("proof_posted_within_days", 30), "proof video posted 41 days ago, asked for proof video posted in the last 30 days"],
    [q("proof_region", "US"), "proof video region Canada, asked for proof video region United States"],
  ])("%o", (check, text) => expect(label(check)).toBe(text));
});

describe("when the close section appears", () => {
  const store = () => evidence([searchRow("1", "ann", 250_000), searchRow("2", "big", 250_000)], { ann: 4_000, big: 14_200 });
  const finish = (creators: string[]) =>
    parseFinish({
      answer: "Here they are.",
      checks: NARROW,
      creators: creators.map((h) => ({ handle: h, proof_video_id: h === "ann" ? "1" : "2", criteria: [] })),
      close: [{ handle: "big", proof_video_id: "2" }],
    });
  const closeOf = (creators: string[], wanted: number | null) => validateFinish(store(), finish(creators), { nowSec: NOW_SEC, notFound: [], wanted }).kept.close.map((c) => c.handle);

  it("is absent when the exact list is full, whatever the agent named", () => expect(closeOf(["ann"], 1)).toEqual([]));
  it("is present when the exact list is short of the number asked", () => expect(closeOf(["ann"], 2)).toEqual(["big"]));
  it("is absent when no number was asked and one exact creator exists", () => expect(closeOf(["ann"], null)).toEqual([]));
  it("is present when no number was asked and there is no exact creator", () => expect(closeOf([], null)).toEqual(["big"]));

  it("nominates a creator the checks removed for one miss, and leaves the exact list as it was", () => {
    const args = parseFinish({ answer: "x", checks: NARROW, creators: [{ handle: "big", proof_video_id: "2", criteria: [] }] });
    const { kept: k, failures } = validateFinish(store(), args, { nowSec: NOW_SEC, notFound: [], wanted: null });
    expect(failures).toEqual([]);
    expect(k.creators).toEqual([]);
    expect(k.excluded.count).toBe(1);
    expect(k.close.map((c) => c.missed)).toEqual(["14,200 followers, asked for at most 10,000 followers"]);
  });
});

const QUESTION = "Find US creators under 10,000 followers posting about a study app with over 100,000 views in the last 30 days";
const BIO = "study tips | biz: big.studies (at) example (dot) com";

function tiktok() {
  return fakeAnyApi({
    "tiktok.search_keyword": () => ({ videos: [searchRow("500", "big", 250_000, "my AI study app routine")], nextCursor: null }),
    "tiktok.profile": (body) => ({ handle: body.handle, followers: 14_200, bio: BIO, avatarUrl: "https://p16-sign.tiktokcdn-us.com/a.jpeg" }),
  });
}

const closeFinish = toolCall("f1", "finish", { answer: "No creator meets every limit of the question.", creators: [], close: [{ handle: "big", proof_video_id: "500" }] });

/** The topic claim the verifier was sent for @big, if any. */
function topicItem(req: ChatRequest): { about: string; claim: string; cites?: string } | undefined {
  const body = JSON.parse(String(req.messages[1]?.content)) as { items?: { about: string; claim: string; cites?: string }[] };
  return body.items?.find((i) => i.about === "@big");
}

async function narrowRun(verdict: string) {
  const model = new ScriptedModel(
    [() => [toolCall("s1", "search_videos", { query: "study app" })], () => [toolCall("i1", "inspect_creator", { handle: "big" })], () => [closeFinish]],
    0.0002,
    verifierSaying(verdict),
  );
  const out = await runAgent(QUESTION, { kind: "free" }, services(tiktok().make, model), undefined);
  return { out, model, display: toDisplay(out) };
}

describe("close creators in a run (rules 3 and 4, and the empty-answer rule)", () => {
  it("tells the agent a ruled-out creator misses one limit, hands the verifier the question as the topic claim, and shows a confirmed one", async () => {
    const { out, model, display } = await narrowRun("supported");
    const inspected = model.requests[2]?.messages.filter((m) => m.role === "tool").at(-1)?.content ?? "";
    expect(JSON.parse(String(inspected))).toMatchObject({ close_match: CLOSE_HINT });
    const claim = model.verifierRequests.map(topicItem).find(Boolean);
    expect(claim?.claim).toContain(QUESTION);
    expect(claim?.cites).toBe("500");
    expect(out.answer.finishedBy).toBe("model");
    expect(display.creators).toEqual([]);
    expect(display.close?.map((c) => [c.handle, c.missed, c.followers, c.hasPublicEmail])).toEqual([["big", "14,200 followers, asked for at most 10,000 followers", 14_200, true]]);
    expect(display.answer.map((s) => s.text)).toEqual(["No creator meets every limit of the question."]);
  });

  it("does not show a close creator whose topic the verifier did not confirm", async () => {
    const { out, display } = await narrowRun("not shown");
    expect(display.close).toEqual([]);
    expect(out.answer.droppedClaims.map((d) => d.claim)).toContain("close @big on topic");
  });
});
