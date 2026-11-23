import { ArgError, type Args } from "./args.ts";
import type { ToolContext, ToolResult } from "./context.ts";
import { inspectCreator } from "./inspectCreator.ts";
import { inspectVideo } from "./inspectVideo.ts";
import { readTranscript } from "./readTranscript.ts";
import { searchVideos } from "./searchVideos.ts";

type ToolFn = (ctx: ToolContext, args: Args) => Promise<ToolResult>;

const TOOLS: Record<string, ToolFn> = {
  search_videos: searchVideos,
  inspect_creator: inspectCreator,
  read_transcript: readTranscript,
  inspect_video: inspectVideo,
};

/** Parses a research tool call's arguments and runs it; a bad call becomes an error the model can read. */
export async function runResearchTool(ctx: ToolContext, name: string, rawArgs: string): Promise<ToolResult> {
  const fn = TOOLS[name];
  if (!fn) return { error: "unknown tool" };
  let args: Args;
  try {
    const parsed: unknown = JSON.parse(rawArgs || "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { error: "arguments must be an object" };
    args = parsed as Args;
  } catch {
    return { error: "arguments were not valid JSON" };
  }
  try {
    return await fn(ctx, args);
  } catch (err) {
    if (err instanceof ArgError) return { error: err.message };
    return { error: `tool failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
