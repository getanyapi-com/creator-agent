import type { DataClient } from "../anyapi.ts";
import { meteredSpender, type Spender } from "../budget.ts";
import type { EvidenceStore } from "../evidence.ts";
import type { TraceToolCall } from "../trace.ts";
import type { ToolContext } from "./context.ts";
import { runResearchTool } from "./dispatch.ts";

/** The store as one tool call sees it: every row the call puts is named, as the answer cites it. */
export function recordingStore(store: EvidenceStore, fetched: Set<string>): EvidenceStore {
  return {
    putVideo: (row) => {
      const stored = store.putVideo(row);
      fetched.add(stored.id);
      return stored;
    },
    getVideo: (id) => store.getVideo(id),
    putCreator: (row) => {
      store.putCreator(row);
      const stored = store.getCreator(row.handle);
      if (stored) fetched.add(`@${stored.handle}`);
    },
    getCreator: (handle) => store.getCreator(handle),
    putTranscript: (row) => {
      store.putTranscript(row);
      fetched.add(`t:${row.videoId}`);
    },
    getTranscript: (videoId) => store.getTranscript(videoId),
    putWatch: (row) => {
      store.putWatch(row);
      fetched.add(`w:${row.videoId}`);
    },
    getWatch: (videoId) => store.getWatch(videoId),
    videosBy: (handle) => store.videosBy(handle),
    snapshot: () => store.snapshot(),
  };
}

/** The data client as one tool call sees it: every call reserved and settled through that call's meter. */
function meteredClient(client: DataClient, spend: Spender): DataClient {
  return { calls: client.calls, run: (endpoint, input) => client.run(endpoint, input, spend) };
}

/**
 * Runs one research tool and traces it with the evidence ids it fetched, when it started (`startedMs`,
 * since the run began) and what it cost the question, its data calls and any model call inside it.
 */
export async function runTracedTool(ctx: ToolContext, name: string, args: string, startedMs: number): Promise<TraceToolCall> {
  const started = Date.now();
  const fetched = new Set<string>();
  let costUsd = 0;
  const spend = meteredSpender(ctx.spend, (usd) => (costUsd += usd));
  const stepCtx: ToolContext = { ...ctx, spend, anyapi: meteredClient(ctx.anyapi, spend), store: recordingStore(ctx.store, fetched) };
  const result = await runResearchTool(stepCtx, name, args);
  return { name, args, result, startedMs, ms: Date.now() - started, costUsd, fetched: [...fetched] };
}
