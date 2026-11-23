import type { EvidenceView } from "@/data/types";
import type { RevealResult } from "@/lib/reveal";
import { Criteria } from "@/components/Criteria";
import { Reveal } from "@/components/Reveal";
import { Views } from "@/components/Views";
import { VideoFacts } from "./VideoFacts";
import type { WatchItem } from "./WatchContext";

interface Props {
  item: WatchItem;
  evidence: Record<string, EvidenceView>;
  reveal: RevealResult | undefined;
  onReveal: (handle: string) => void;
}

/** The section's reason for this video, the creator's usual views against it, its caption and date, and every check with its evidence. */
export function WatchDetails({ item, evidence, reveal, onReveal }: Props) {
  const { creator, video } = item;
  return (
    <div className="space-y-5 p-4">
      <div>
        <h3 className="font-semibold">{item.heading}</h3>
        {item.reason !== null && <p className="mt-1 text-small">{item.reason}</p>}
      </div>
      {creator === null ? (
        <>
          <VideoFacts video={video} withViews />
          <p className="text-small text-fg-muted">This video shows the pattern; its creator is not one of the answers.</p>
        </>
      ) : (
        <>
          {reveal !== undefined && <Reveal handle={creator.handle} result={reveal} onReveal={() => onReveal(creator.handle)} full />}
          <Views creator={creator} />
          <VideoFacts video={video} />
          <div>
            <h3 className="mb-2 text-small font-medium text-fg-muted">What was checked</h3>
            <Criteria key={creator.handle} criteria={creator.criteria} evidence={evidence} />
          </div>
        </>
      )}
    </div>
  );
}
