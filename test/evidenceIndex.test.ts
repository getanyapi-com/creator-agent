import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent.ts";
import { MemoryContactStore } from "../src/contactStore.ts";
import { MemoryEvidenceStore } from "../src/evidence.ts";
import { toCreatorRow, toVideoRow } from "../src/ingest.ts";
import { recordingStore } from "../src/tools/traced.ts";
import { fakeAnyApi, kept, postRow, ScriptedModel, searchRow, services, toolCall } from "./fakes.ts";

describe("recordingStore", () => {
  it("names every row a call puts as the answer cites it", () => {
    const fetched = new Set<string>();
    const store = recordingStore(new MemoryEvidenceStore(), fetched);
    const contacts = new MemoryContactStore();
    const video = toVideoRow(searchRow("100", "Ann", 10), "q", contacts);
    if (video) store.putVideo(video);
    store.putCreator(kept(toCreatorRow({ handle: "Ann", followers: 5, bio: "" }, "Ann", contacts, [])));
    store.putTranscript({ videoId: "100", text: "hi" });
    store.putWatch({ videoId: "100", model: "g", fallbackReason: null, observations: [], onScreenText: [], lookedAt: "", hypothesis: "" });
    expect([...fetched]).toEqual(["100", "@ann", "t:100", "w:100"]);
  });
});

describe("evidenceIndex", () => {
  it("maps each evidence id in a run to the turn and tool call that fetched it", async () => {
    const api = fakeAnyApi({
      "tiktok.search_keyword": () => ({ videos: [searchRow("100", "ann", 250_000), searchRow("200", "bob", 90_000)] }),
      "tiktok.profile": (body) => ({ handle: body.handle, followers: 4321, bio: "student" }),
      "tiktok.profile_videos": (body) => ({ videos: [postRow("101", String(body.handle), 1000, 1)] }),
      "tiktok.video_transcript": () => ({ transcript: "this study app" }),
    });
    const model = new ScriptedModel([
      () => [toolCall("s", "search_videos", { query: "study app" }), toolCall("i", "inspect_creator", { handle: "ann" })],
      () => [toolCall("t", "read_transcript", { video: "200" }), toolCall("s2", "search_videos", { query: "notes app" })],
      () => [toolCall("f", "finish", { answer: "Ann fits.", creators: [{ handle: "ann", proof_video_id: "100", criteria: [] }] })],
    ]);
    const out = await runAgent("Find study creators", { kind: "free" }, services(api.make, model));
    expect(out.evidenceIndex).toEqual({
      "100": [{ turn: 1, callIndex: 0 }, { turn: 2, callIndex: 1 }],
      "200": [{ turn: 1, callIndex: 0 }, { turn: 2, callIndex: 1 }],
      "101": [{ turn: 1, callIndex: 1 }],
      "@ann": [{ turn: 1, callIndex: 1 }],
      "t:200": [{ turn: 2, callIndex: 0 }],
    });
    expect(out.trace[1]?.toolCalls[0]?.name).toBe("read_transcript");
  });
});
