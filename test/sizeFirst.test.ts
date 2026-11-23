import { describe, expect, it } from "vitest";
import { openSession } from "../src/session.ts";
import { runResearchTool } from "../src/tools/dispatch.ts";
import { DAY, fakeAnyApi, NOW_SEC, postRow, ScriptedModel, searchRow, services } from "./fakes.ts";

const UNDER_10K = [{ kind: "followers_at_most", value: 10000, from: "question" }];
const SIZES: Record<string, number> = { ann: 4321, big: 250_000, cat: 900 };

function tiktok() {
  return fakeAnyApi({
    "tiktok.search_keyword": () => ({
      videos: [
        searchRow("1", "ann", 250_000),
        searchRow("2", "big", 900_000),
        searchRow("3", "cat", 40_000),
        { ...searchRow("4", "dan", 300_000), region: "GB" },
        { ...searchRow("5", "eve", 200_000), createdUtc: NOW_SEC - 60 * DAY },
      ],
    }),
    "tiktok.profile": (body) => ({ handle: body.handle, followers: SIZES[String(body.handle)] ?? 5000, bio: "student" }),
    "tiktok.profile_videos": (body) => ({ videos: [postRow("101", String(body.handle), 1000, 1), postRow("102", String(body.handle), 3000, 2)] }),
  });
}

function session(api: ReturnType<typeof tiktok>) {
  return openSession("q", { kind: "free" }, services(api.make, new ScriptedModel([])));
}

const run = (s: ReturnType<typeof session>, name: string, args: Record<string, unknown>) => runResearchTool(s.ctx, name, JSON.stringify(args));
const endpoints = (api: ReturnType<typeof tiktok>) => api.requests.map((r) => r.endpoint);

describe("inspect_creator checks size before buying posts (round 4, D1)", () => {
  it("rules out a creator the profile shows outside a follower check, with the count as evidence, and buys no post list", async () => {
    const api = tiktok();
    const s = session(api);
    const result = await run(s, "inspect_creator", { handle: "big", checks: UNDER_10K });
    expect(endpoints(api)).toEqual(["tiktok.profile"]);
    expect(result).toMatchObject({ evidence_id: "@big", followers: 250_000 });
    expect(String(result.ruled_out)).toContain("at most 10,000 followers");
    expect(s.ctx.store.getCreator("big")?.followers).toBe(250_000);
  });

  it("buys the post list after the profile when the creator is inside the check", async () => {
    const api = tiktok();
    const result = await run(session(api), "inspect_creator", { handle: "ann", checks: UNDER_10K });
    expect(endpoints(api)).toEqual(["tiktok.profile", "tiktok.profile_videos"]);
    expect(result).toMatchObject({ followers: 4321, posts_sampled: 2, usual_views: 2000 });
    expect(result.ruled_out).toBeUndefined();
  });

  it("buys both together when no follower check is passed, and never buys a profile already read this run", async () => {
    const api = tiktok();
    const s = session(api);
    await run(s, "inspect_creator", { handle: "ann" });
    expect(endpoints(api).sort()).toEqual(["tiktok.profile", "tiktok.profile_videos"]);
    const before = api.requests.length;
    await run(s, "inspect_creator", { handle: "ann", checks: UNDER_10K });
    expect(api.requests.slice(before)).toEqual([]);
  });
});

describe("search_videos takes the question's checks (round 4, D2)", () => {
  it("leaves out rows that already miss a views, recency or region check, and counts them", async () => {
    const api = tiktok();
    const checks = [
      { kind: "proof_views_at_least", value: 100_000, from: "question" },
      { kind: "proof_posted_within_days", value: 30, from: "question" },
      { kind: "proof_region", value: "US", from: "question" },
    ];
    const result = await run(session(api), "search_videos", { query: "study app", checks });
    expect((result.videos as { id: string }[]).map((v) => v.id)).toEqual(["2", "1"]);
    expect(result.left_out_by_checks).toEqual({ views: 1, recency: 1, region: 1 });
    expect(endpoints(api)).toEqual(["tiktok.search_keyword"]);
  });

  it("buys no profile while searching, even with a follower check, and shows no follower counts on rows (D2's profile reads were measured and not kept)", async () => {
    const api = tiktok();
    const result = await run(session(api), "search_videos", { query: "study app", checks: [...UNDER_10K, { kind: "proof_region", value: "US", from: "question" }] });
    expect(endpoints(api)).toEqual(["tiktok.search_keyword"]);
    expect(JSON.stringify(result)).not.toContain("creator_followers");
    expect(result.left_out_by_checks).toEqual({ views: 0, recency: 0, region: 1 });
  });
});
