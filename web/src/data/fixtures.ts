import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DisplayRun } from "@/server/live/displayTypes";
import { toThread } from "./adapter";
import { fixtureMedia } from "./media";
import type { FeedItem, ThreadView } from "./types";

/**
 * Recorded answers, read at build time from web/fixtures: each file is the core's display object for
 * one saved bench run, built by `toDisplay`, with the saved run it came from and when it was asked.
 * A file q07-compare-three.json is thread "compare-three".
 */
const DIR = path.join(process.cwd(), "fixtures");
const FILE = /^q\d+-(.+)\.json$/;

interface FixtureFile {
  /** The saved bench run this was built from, under the core's bench/out/. */
  source: string;
  askedAt: string;
  display: DisplayRun;
}

const threads = new Map<string, ThreadView>();

function load(): Map<string, ThreadView> {
  if (threads.size > 0) return threads;
  for (const file of readdirSync(DIR).sort()) {
    const id = FILE.exec(file)?.[1];
    if (id === undefined) continue;
    const fixture = JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as FixtureFile;
    threads.set(id, toThread({ id, askedAt: fixture.askedAt, tier: "free", walletStop: null, display: fixture.display, media: fixtureMedia }));
  }
  return threads;
}

export function getThread(id: string): ThreadView | null {
  return load().get(id) ?? null;
}

/** A thread as the front page feed lists it. */
export function feedItem(t: ThreadView): FeedItem {
  return {
    id: t.id,
    question: t.question,
    askedAt: t.askedAt,
    creatorCount: t.creators.length,
    totalUsd: t.cost.totalUsd,
    creators: t.creators.map((c) => ({ handle: c.handle, avatarUrl: c.avatarUrl, proofThumbnailUrl: c.proof?.thumbnailUrl })),
  };
}

/** Recent public threads, newest first. */
export function getFeed(): FeedItem[] {
  return [...load().values()]
    .map(feedItem)
    .sort((a, b) => (b.askedAt ?? "").localeCompare(a.askedAt ?? ""));
}
