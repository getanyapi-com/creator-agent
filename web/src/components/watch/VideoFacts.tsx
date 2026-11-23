import { TikTokMark } from "@/components/TikTokMark";
import type { VideoView } from "@/data/types";
import { formatCount, formatDay } from "@/lib/format";
import { captionText } from "@/lib/caption";

/** The video's caption, its views, when and where it was posted, and a link to it on TikTok. */
export function VideoFacts({ video, withViews = false }: { video: VideoView; withViews?: boolean }) {
  const meta = [
    withViews ? `${formatCount(video.views)} views` : null,
    formatDay(video.postedUtc),
    video.region,
    video.paidLabel === true ? "Paid partnership" : null,
  ].filter((part) => part !== null);
  return (
    <div className="space-y-1 text-small">
      <p className="line-clamp-3 break-words">{video.caption ?? <span className="text-fg-muted">{captionText(video)}</span>}</p>
      <p className="flex flex-wrap items-center gap-x-3 text-fg-muted">
        {meta.length > 0 && <span>{meta.join(" · ")}</span>}
        <a href={video.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-accent-text hover:underline">
          <TikTokMark size={12} />
          Watch on TikTok
        </a>
      </p>
    </div>
  );
}
