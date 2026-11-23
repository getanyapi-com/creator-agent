import { PlayGlyph } from "@/components/watch/PlayGlyph";
import { WatchCover } from "@/components/watch/WatchCover";
import type { VideoView } from "@/data/types";
import { formatCount } from "@/lib/format";
import { Cover } from "@/components/Cover";

interface Props {
  videos: VideoView[];
  /** The section the row is in, shown with a video in the watch sidebar. */
  heading: string;
  reason: string | null;
}

/**
 * Videos as a row of small covers that scrolls sideways. Each plays in the watch sidebar, or links to the
 * video on TikTok on a page without one.
 */
export function VideoStrip({ videos, heading, reason }: Props) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      {videos.map((video) => (
        <WatchCover
          key={video.id}
          video={video}
          heading={heading}
          reason={reason}
          label={video.creator === "" ? "Watch this video" : `Watch @${video.creator}'s video`}
          className="group block w-24 shrink-0 text-left hover:opacity-90"
        >
          {({ watching, playsHere }) => (
            <Cover src={video.thumbnailUrl} // Marked inside its edge: the row scrolls sideways, so a ring outside the cover would be clipped.
              className={`rounded-control ${watching ? "outline-2 -outline-offset-2 outline-accent" : ""}`}>
              {(onMedia) => (
                <>
                  {playsHere && <PlayGlyph size={28} />}
                  <span
                    className={`absolute inset-x-0 bottom-0 p-1.5 text-mono leading-tight ${onMedia ? "bg-linear-to-t from-scrim to-scrim-clear pt-5 text-media-fg" : ""}`}
                  >
                    {video.creator !== "" && <span className="block truncate font-medium">@{video.creator}</span>}
                    {/* A video named by id only has no maker or views to show. */}
                    <span className={`block truncate font-mono ${onMedia ? "" : "text-fg-muted"}`}>{video.views === null ? "On TikTok" : `${formatCount(video.views)} views`}</span>
                  </span>
                </>
              )}
            </Cover>
          )}
        </WatchCover>
      ))}
    </div>
  );
}
