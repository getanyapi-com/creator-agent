"use client";

import { TikTokMark } from "@/components/TikTokMark";
import { PlayGlyph } from "@/components/watch/PlayGlyph";
import { WatchCover } from "@/components/watch/WatchCover";
import type { CreatorView, SectionView } from "@/data/types";
import { formatCount, formatFollowers, formatRatio } from "@/lib/format";
import type { RevealResult } from "@/lib/reveal";
import { Avatar } from "@/components/Avatar";
import { Cover } from "@/components/Cover";
import { criteriaSummary } from "@/components/criteriaSummary";
import { Reveal } from "@/components/Reveal";
import { captionText } from "@/lib/caption";

interface Props {
  creator: CreatorView;
  section: SectionView;
  reveal: RevealResult | undefined;
  onReveal: () => void;
}

const RING = "ring-2 ring-accent ring-offset-2 ring-offset-bg";

/** One creator as TikTok shows a video: the proof cover with face and handle on it, the numbers beneath. The cover plays it in the watch sidebar. */
export function CreatorTile({ creator, section, reveal, onReveal }: Props) {
  const proof = creator.proof;
  const summary = criteriaSummary(creator.criteria);
  const cover = (watching: boolean, playsHere: boolean) => (
    <Cover
      src={proof?.thumbnailUrl}
      className={`rounded-card transition-motion ${watching ? RING : ""}`}
      fallback={
        <>
          <TikTokMark size={18} />
          <span className="line-clamp-4 text-small text-fg-muted">{proof === null ? "No proof video" : captionText(proof)}</span>
        </>
      }
    >
      {(onMedia) => (
        <>
          <span
            className={`absolute inset-x-0 top-0 flex items-center gap-2 p-2.5 ${onMedia ? "bg-linear-to-b from-scrim to-scrim-clear pb-6 text-media-fg" : ""}`}
          >
            <Avatar handle={creator.handle} src={creator.avatarUrl} size={28} />
            <span className="truncate text-small font-semibold">@{creator.handle}</span>
          </span>
          {/* A close creator's missed limit, on a solid chip so it reads over any frame of the video. */}
          {creator.missed !== undefined && (
            <span className="absolute inset-x-2.5 top-12 rounded-control bg-bg px-2 py-1 text-small leading-snug font-medium text-fg">{creator.missed}</span>
          )}
          {playsHere && <PlayGlyph />}
          <span
            className={`absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5 ${onMedia ? "bg-linear-to-t from-scrim to-scrim-clear pt-8 text-media-fg" : ""}`}
          >
            <span className="leading-tight">
              <span className="block text-h3 font-semibold">{formatCount(proof?.views ?? null)}</span>
              <span className={`text-small ${onMedia ? "text-media-fg-muted" : "text-fg-muted"}`}>views</span>
            </span>
            {creator.proofVsUsualRatio !== null && (
              <span
                title={`${formatRatio(creator.proofVsUsualRatio)} their usual views`}
                className={`rounded-control px-1.5 py-0.5 font-mono text-mono font-medium ${onMedia ? "bg-media-chip" : "bg-accent-soft text-accent-text"}`}
              >
                {formatRatio(creator.proofVsUsualRatio)} usual
              </span>
            )}
          </span>
        </>
      )}
    </Cover>
  );
  return (
    <div className="flex min-w-0 flex-col">
      {proof === null ? (
        cover(false, false)
      ) : (
        <WatchCover
          video={proof}
          creator={creator}
          heading={section.heading}
          reason={section.reason}
          label={`Watch @${creator.handle}'s video`}
          className="group block text-left outline-offset-2 hover:opacity-90"
        >
          {({ watching, playsHere }) => cover(watching, playsHere)}
        </WatchCover>
      )}
      <div className="mt-2 space-y-1 px-0.5 text-small">
        <p className="text-fg-muted">
          <span className="whitespace-nowrap">
            {creator.followers === null ? "Followers unknown" : `${formatFollowers(creator.followers)} followers`}
          </span>
          {/* The space before the dot sits outside both pieces, so a narrow tile breaks the line there and nowhere else. */}
          {creator.usualViews !== null && (
            <>
              {" "}
              <span className="whitespace-nowrap">· usually {formatCount(creator.usualViews)} views</span>
            </>
          )}
        </p>
        <p>
          {summary.met}
          {summary.contradicted > 0 && <span className="text-contradicted"> · {summary.contradicted} contradicted</span>}
        </p>
        <div className="pt-1">
          <Reveal handle={creator.handle} result={reveal} onReveal={onReveal} />
        </div>
      </div>
    </div>
  );
}
