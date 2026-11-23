import { ENDPOINTS, INSPECT_CREATOR_USD } from "../endpoints.ts";
import type { ToolSpec } from "../llm.ts";
import { formatUsd as usd } from "../money.ts";
import { CHECK_KINDS, CHECK_SOURCES } from "../finish/checks.ts";
import { DAYS, SORTS } from "./args.ts";

const SEARCH_USD = usd(ENDPOINTS["tiktok.search_keyword"].priceUsd);
const CREATOR_USD = usd(INSPECT_CREATOR_USD);
const TRANSCRIPT_USD = usd(ENDPOINTS["tiktok.video_transcript"].priceUsd);
const WATCH_USD = usd(ENDPOINTS["tiktok.video_download"].priceUsd);

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolSpec {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required } } };
}

const video = { type: "string", description: "A video id from an earlier result, or a TikTok video URL." };

const checkItems = {
  type: "object",
  properties: {
    kind: { type: "string", enum: [...CHECK_KINDS] },
    value: { type: ["number", "string"], description: "The number, or the two-letter country code, from the question or your assumption." },
    from: { type: "string", enum: [...CHECK_SOURCES], description: "question when the question states it; assumption when you chose it." },
  },
  required: ["kind", "value", "from"],
};

const checks = {
  type: "array",
  description:
    "Every requirement about follower count, proof video views, how recent the proof video is, or the proof video's region, declared once for the whole answer; at most one per kind. The code applies each to every creator: one who misses a check from the question is left out and counted, one who misses an assumed check stays, marked. The code writes these thresholds in the answer for you.",
  items: checkItems,
};

/** Checks the model assumes, passed to a research tool; the question's own are applied without being passed (round 4, D1, D2, F1). */
const toolChecks = {
  type: "array",
  description: "Only limits you assume (the same kinds and values you will declare in finish), or the question's when the code says it could not read them. The question's own limits are applied for you. The code leaves out rows and creators that already miss a check, and buys no more about them.",
  items: checkItems,
};

const criterion = {
  type: "object",
  properties: {
    criterion: { type: "string", description: "One requirement about content (topic, product named, format) taken from the question, in words, with no numbers." },
    state: { type: "string", enum: ["supported", "contradicted", "unknown"] },
    evidence_id: {
      type: "string",
      description: "Text that shows it: a video id (its caption), @handle (bio), t:<video id> (transcript) or w:<video id> (watched). Required unless unknown.",
    },
  },
  required: ["criterion", "state"],
};

export const FINISH_TOOL = tool(
  "finish",
  "End the research and give the answer. Write no numbers or number words in any text; the code adds every figure from the evidence. Content claims are re-read against the text they cite; a claim the text does not show becomes unknown.",
  {
    answer: { type: "string", description: "A short direct answer to the question: a one-paragraph summary above the sections that does not list the creators." },
    checks,
    creators: {
      type: "array",
      items: {
        type: "object",
        properties: {
          handle: { type: "string" },
          proof_video_id: { type: "string", description: "A video by this creator that you saw and that proves the fit." },
          criteria: { type: "array", items: criterion },
        },
        required: ["handle", "proof_video_id", "criteria"],
      },
    },
    close: {
      type: "array",
      description:
        "Only when you have fewer good creators than the question asks for (or none, when it names no number): creators you already looked at who are on the question's topic but miss exactly one of its limits. The code checks the one miss and the topic, and shows them after the answer, apart from it. Never put a creator who fits here.",
      items: {
        type: "object",
        properties: {
          handle: { type: "string" },
          proof_video_id: { type: "string", description: "A video by this creator that you saw, on the question's topic." },
          evidence_id: { type: "string", description: "Text that shows the topic, as for a criterion; the proof video's caption when left out." },
        },
        required: ["handle", "proof_video_id"],
      },
    },
    videos: {
      type: "array",
      items: { type: "object", properties: { video_id: { type: "string" }, note: { type: "string" } }, required: ["video_id"] },
    },
    patterns: {
      type: "array",
      description: "For questions about what works: each pattern cites at least two video ids.",
      items: {
        type: "object",
        properties: { pattern: { type: "string" }, video_ids: { type: "array", items: { type: "string" } } },
        required: ["pattern", "video_ids"],
      },
    },
    sections: {
      type: "array",
      description:
        "The answer in reading order. First one 'best' section with the single best fit and why; then 'group' sections, each a set of creators that share a reason ('also good because ...'); a 'pattern' section's members are videos that show a pattern. Every creator you return belongs in exactly one best or group section.",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["best", "group", "pattern"] },
          heading: { type: "string", description: "A few words, no numbers." },
          reason: { type: "string", description: "One or two sentences the cited evidence shows, creators only as @handle, no numbers." },
          members: { type: "array", items: { type: "string" }, description: "@handle of each creator, or the video ids for a pattern." },
        },
        required: ["kind", "heading", "reason", "members"],
      },
    },
    assumptions: { type: "array", items: { type: "string" } },
    limits_note: { type: "string", description: "What you could not check or find, in plain words." },
  },
  ["answer", "creators"],
);

export const RESEARCH_TOOLS: ToolSpec[] = [
  tool(
    "search_videos",
    `One page of TikTok videos for a phrase. Search the words creators write or say, or an app or brand name. Asking the same search again returns its next page. Costs ${SEARCH_USD}. Rows that already miss a views, recency or region check are left out. Rows carry no follower counts: inspect_creator reads them.`,
    {
      query: { type: "string" },
      sort: { type: "string", enum: [...SORTS] },
      days: { type: "integer", enum: [...DAYS], description: "Only videos posted in the last N days; 0 means any time." },
      checks: toolChecks,
    },
    ["query"],
  ),
  tool(
    "inspect_creator",
    `One creator: followers, bio, whether a public email exists, usual views (median of recent posts), best recent post, posting pace, share of posts with the paid label. Costs ${CREATOR_USD}; a profile already read this run is not bought again. A creator outside a follower check is returned as ruled out and its posts are not bought.`,
    { handle: { type: "string" }, checks: toolChecks },
    ["handle"],
  ),
  tool("read_transcript", `What is said in one video, or 'no captions'. Costs ${TRANSCRIPT_USD}.`, { video }, ["video"]),
  tool(
    "inspect_video",
    `A video model watches one video: timestamped observations and on-screen text, and separately a guess at why it worked. Slow (up to a minute). Costs about ${WATCH_USD}.`,
    { video },
    ["video"],
  ),
  FINISH_TOOL,
];
