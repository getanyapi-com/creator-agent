import { FREE_BUDGET_USD, revealContact, runAgent, toDisplay, type ProgressEvent, type RunOutput, type Tier as CoreTier } from "../../../src/index.ts";
import { releaseQuestion } from "@/auth/questionQuota";
import { toThread } from "@/data/adapter";
import { feedItem } from "@/data/fixtures";
import type { LiveRun } from "@/data/live";
import type { FeedItem, OwnFeedItem, Tier } from "@/data/types";
import { db } from "@/db";
import { processOwner } from "@/db/owner";
import { admitRun, type Admission } from "./live/admit";
import type { DisplayRun } from "./live/displayTypes";
import { houseKinds, RunSpend, writeSpend, type SpendRow, type SpendSnapshot } from "./live/houseSpend";
import { liveProgress } from "./live/liveSteps";
import { retryMediaMark, saveMedia, savedMedia } from "./live/media";
import { endRun, logWriteFailure, retryEnd, retryEnds } from "./live/runEnd";
import { runServices, trackSpend } from "./live/services";
import { askedRuns, claimMediaSave, finishedRuns, markRemoved, newRunId, readRecord, readStoredRun, saveProgress, type RunMeta, type StoredRun } from "./live/store";
import { walletFetch, type WalletStop } from "./wallet/walletFetch";

export { readMedia } from "./live/media";

/**
 * The one module in web/ that runs the agent core: start a question, read where it stands, list
 * finished public ones for the front page, read a creator's bio email for Reveal, and let the asker remove
 * it. A wallet question's data is paid from the asker's AnyAPI wallet, and the question is private: to anyone
 * but its asker it does not exist. Runs go on inside the server process that admitted them after the request that started them
 * returns. The core's private record stays in the database; a browser only ever gets the core's
 * progress events, relabelled by `liveProgress`, and its display object.
 */

type Stored = StoredRun<DisplayRun, ProgressEvent>;

const RESTARTED = "The server restarted while this question was being researched.";
/** A run only fails here when the core could not start or threw; its error text stays on the server. */
const FAILED = "Something went wrong on our side.";
/** A run the core finished without one paid call, such as when every model call was refused before it ran. */
const NOT_STARTED = "The research could not start.";

/** What a run that never opened its budget has spent. */
const NOTHING: SpendSnapshot = { spent: { data: 0, model: 0 }, reserved: { data: 0, model: 0 } };

/** A run that fails having spent nothing, however it failed, gives its asker the question back. */
function failedFor(id: string, error: string, spentUsd: number, rows: SpendRow[], walletStop: WalletStop | null = null): Promise<void> {
  return endRun(id, { status: "failed", error, walletStop }, rows, async () => {
    if (spentUsd === 0) await releaseQuestion(id);
  });
}

/** The core's tier: a wallet question keeps the free question's budget, $0.10 (decided 2026-11-20); raising it is the owner's decision. */
function coreTier(tier: Tier): CoreTier {
  return tier === "free" ? { kind: "free" } : { kind: "wallet", budgetUsd: FREE_BUDGET_USD };
}

const lastSpent = (progress: ProgressEvent[]): number => progress.at(-1)?.spentUsd ?? 0;

async function execute(meta: RunMeta, askerId: string, tier: Tier): Promise<void> {
  const wallet = tier === "wallet" ? walletFetch(askerId) : null;
  const walletStop = () => wallet?.stop() ?? null;
  const progress: ProgressEvent[] = [];
  let tracked: ReturnType<typeof trackSpend> | null = null;
  const spend = new RunSpend(houseKinds(tier));
  const rows = () => spend.rows(tracked?.spent() ?? NOTHING);
  // Progress and spend are written in the order they happen, one write at a time. A failed write is logged and
  // the research goes on: the next write carries the whole state. The final one ends the run (`endRun`).
  let writes = Promise.resolve();
  const write = (what: "progress" | "spend", step: () => Promise<void>) => (writes = writes.then(step).catch((err: unknown) => logWriteFailure(meta.id, what, err)));
  const onProgress = (event: ProgressEvent) => {
    progress.push(event);
    const snapshot = [...progress];
    write("progress", () => saveProgress(meta.id, snapshot));
    write("spend", () => writeSpend(db(), meta.id, rows()));
  };
  try {
    tracked = trackSpend(await runServices(wallet?.fetchFn ?? null));
    const output = await runAgent(meta.question, coreTier(tier), tracked.services, onProgress);
    await writes;
    if (output.costs.dataUsd <= 0 && output.costs.modelUsd <= 0) return await failedFor(meta.id, NOT_STARTED, 0, rows(), walletStop());
    const display = toDisplay(output);
    await endRun(meta.id, { status: "done", error: null, walletStop: walletStop(), record: output satisfies RunOutput, display }, rows(), async () => {
      void saveMedia(meta.id, display).catch(() => undefined);
    });
  } catch {
    await writes;
    await failedFor(meta.id, FAILED, lastSpent(progress), rows(), walletStop());
  }
}

/** Starts the agent on a question for this account, on the tier the server grants it, and returns the new thread's id at once, or why it may not start. */
export async function startRun(question: string, askerId: string, tier: Tier): Promise<{ id: string } | Exclude<Admission, { admitted: true }>> {
  const meta: RunMeta = { id: newRunId(), question: question.trim(), startedAt: new Date().toISOString(), status: "running", error: null, finishedAt: null };
  await retryEnds();
  const admission = await admitRun(meta, askerId, tier);
  if (!("admitted" in admission)) return admission;
  void execute(meta, askerId, tier);
  return { id: meta.id };
}

/** Whether this account asked this live question. */
export async function askedBy(id: string, userId: string | null): Promise<boolean> {
  return userId !== null && (await readStoredRun(id))?.askerId === userId;
}

/**
 * A question this process could not end is tried again here. A running question whose process died is ended
 * here, the first time anyone reads it; its house spend stays as its last spend write left it, which is what was
 * billed by then plus what was reserved then for calls whose bill is unknown, and nothing billed after that write.
 * A finished one whose images were left part-way by a process that died has the save taken over by this process, once;
 * one whose images this process saved but could not mark saved is marked here.
 */
async function settle(stored: Stored): Promise<Stored> {
  const ended = await retryEnd(stored.id);
  const marked = await retryMediaMark(stored.id).catch(() => false);
  const run = ended || marked ? ((await readStoredRun<DisplayRun, ProgressEvent>(stored.id)) ?? stored) : stored;
  if (run.ownerAlive) return run;
  if (run.status === "done" && !run.mediaSaved && run.display !== null && (await claimMediaSave(run.id, await processOwner()))) {
    void saveMedia(run.id, run.display).catch(() => undefined);
  }
  if (run.status !== "running") return run;
  await failedFor(run.id, RESTARTED, lastSpent(run.progress), []);
  return (await readStoredRun<DisplayRun, ProgressEvent>(run.id)) ?? run;
}

/**
 * Where a live question stands, as a browser may receive it. `viewerId` is the signed-in account, if
 * any: only the asker gets the typed question back while there is no display object, because only the
 * display object's question has passed the core's gate.
 */
function toLiveRun(run: Stored, viewerId: string | null, media: Record<string, string>): LiveRun {
  const display = run.status === "done" ? run.display : null;
  const startedMs = Date.parse(run.startedAt);
  return {
    id: run.id,
    status: run.status,
    askedAt: run.startedAt,
    elapsedMs: Date.now() - startedMs,
    wallMs: run.finishedAt === null ? null : Date.parse(run.finishedAt) - startedMs,
    question: display === null && viewerId !== null && run.askerId === viewerId ? run.question : null,
    error: run.error,
    tier: run.tier,
    walletStop: run.walletStop,
    limitUsd: FREE_BUDGET_USD,
    progress: display === null ? liveProgress(run.progress) : [],
    display,
    media: display === null ? {} : media,
    // The answer is shown at once; its images are saved after it (`saveMedia`), and the page keeps asking until they are.
    imagesPending: display !== null && !run.mediaSaved,
  };
}

/** Where a live question stands; null for an unknown or removed id, and for someone else's wallet question. */
export async function readRun(id: string, viewerId: string | null): Promise<LiveRun | null> {
  const stored = await readStoredRun<DisplayRun, ProgressEvent>(id);
  if (stored === null || (stored.tier === "wallet" && stored.askerId !== viewerId)) return null;
  const run = await settle(stored);
  const media = run.status === "done" ? ((await savedMedia([id])).get(id) ?? {}) : {};
  return toLiveRun(run, viewerId, media);
}

/** Finished public questions for the front page, newest first. */
export async function liveFeed(): Promise<FeedItem[]> {
  const finished = await finishedRuns<DisplayRun, ProgressEvent>();
  const media = await savedMedia(finished.map((run) => run.id));
  return finished.flatMap((stored) => {
    const run = toLiveRun(stored, null, media.get(stored.id) ?? {});
    if (run.display === null) return [];
    return [feedItem(toThread({ ...run, display: run.display, media: (name) => run.media[name] }))];
  });
}

/**
 * How many of an account's own questions the front page shows: two full rows of its question grid at its widest,
 * three columns (`HomePage`), so the public questions still start near the top.
 */
const YOUR_QUESTIONS = 6;

/** The signed-in account's own questions that are not removed, newest first, and how many it has in all; never anyone else's. */
export async function yourQuestions(askerId: string): Promise<{ items: OwnFeedItem[]; total: number }> {
  const { runs: mine, total } = await askedRuns<DisplayRun, ProgressEvent>(askerId, YOUR_QUESTIONS);
  const settledRuns = await Promise.all(mine.map(settle));
  const media = await savedMedia(settledRuns.map((run) => run.id));
  const items = settledRuns.map((stored): OwnFeedItem => {
    const run = toLiveRun(stored, askerId, media.get(stored.id) ?? {});
    const item: FeedItem =
      run.display === null
        ? { id: run.id, question: stored.question, askedAt: run.askedAt, creatorCount: 0, totalUsd: lastSpent(stored.progress), creators: [] }
        : feedItem(toThread({ ...run, display: run.display, media: (name) => run.media[name] }));
    return { ...item, private: stored.tier === "wallet", status: run.status };
  });
  return { items, total };
}

/**
 * The email the core found in this creator's public bio, read from the private record at the moment
 * of a Reveal, for a creator the display object says has one; null when there is none, undefined
 * when the run is unknown to this viewer.
 */
export async function bioEmail(id: string, handle: string, viewerId: string): Promise<string | null | undefined> {
  const run = await readRun(id, viewerId);
  if (run === null) return undefined;
  const creator = run.display?.creators.find((c) => c.handle === handle.replace(/^@/, "").toLowerCase());
  const record = creator?.hasPublicEmail === true ? await readRecord<RunOutput>(id) : null;
  return record === null || creator === undefined ? null : revealContact(record, creator.handle).email;
}

/** Takes a live question off the front page and its link, for its asker only; another account's wallet question is missing to it, as everywhere. */
export async function removeRun(id: string, userId: string): Promise<"removed" | "not-asker" | "missing"> {
  const run = await readStoredRun(id);
  if (run === null || (run.tier === "wallet" && run.askerId !== userId)) return "missing";
  if (run.askerId !== userId) return "not-asker";
  await markRemoved(id);
  return "removed";
}
