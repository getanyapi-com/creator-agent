"use client";

import Link from "next/link";
import type { FeedItem, OwnFeedItem } from "@/data/types";
import { formatStamp, formatUsd, plural } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { Cover } from "@/components/Cover";

/** Proof video covers across the front of each card; the card is narrow, so the rest are counted on the last one. */
const FRONT_TILES = 3;

/** What stands in for the covers of a question with no creators, by where it stands. */
const NO_COVERS = { running: "Still researching", failed: "Stopped before an answer", done: "No creators found" };

/**
 * One question, fronted by the videos it found, with when it was asked, how many creators and what it cost. One of
 * the account's own also says whether it is private, and may still be running or have stopped.
 */
export function QuestionTile({ item, href }: { item: FeedItem | OwnFeedItem; href: string }) {
  const shown = item.creators.slice(0, FRONT_TILES);
  const more = item.creators.length - shown.length;
  const own = "status" in item ? item : null;
  const answered = own === null || own.status === "done";
  const meta = [own?.private === true ? "Private" : null, formatStamp(item.askedAt), answered ? plural(item.creatorCount, "creator") : null, formatUsd(item.totalUsd)];
  return (
    <Link href={href} className="group flex w-full flex-col rounded-card border bg-surface p-2 transition-motion hover:border-accent-line">
      {shown.length === 0 ? (
        <span className="flex aspect-[3/1.75] items-center justify-center rounded-control bg-surface-2 text-small text-fg-muted">
          {NO_COVERS[own?.status ?? "done"]}
        </span>
      ) : (
        <span className="grid grid-cols-3 gap-1.5">
          {shown.map(({ handle, avatarUrl, proofThumbnailUrl }, index) => (
            <Cover key={handle} src={proofThumbnailUrl} className="rounded-control" fallback={<Avatar handle={handle} src={avatarUrl} size={36} />}>
              {(onMedia) => (
                <>
                  {index === shown.length - 1 && more > 0 && (
                    <span className="absolute top-1.5 right-1.5 rounded-control bg-bg px-1.5 py-0.5 font-mono text-mono text-fg-muted">+{more}</span>
                  )}
                  <span
                    className={`absolute inset-x-0 bottom-0 truncate p-1.5 text-mono font-medium ${onMedia ? "bg-linear-to-t from-scrim to-scrim-clear pt-5 text-media-fg" : "text-fg"}`}
                  >
                    @{handle}
                  </span>
                </>
              )}
            </Cover>
          ))}
        </span>
      )}
      <span className="flex flex-1 flex-col px-1.5 pt-3 pb-1.5">
        <span className="line-clamp-3 font-medium group-hover:text-accent-text">{item.question}</span>
        <span className="mt-auto pt-2 text-small text-fg-muted">
          {meta.filter((part) => part !== null).join(" · ")}
        </span>
      </span>
    </Link>
  );
}
