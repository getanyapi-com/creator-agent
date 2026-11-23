import { TikTokMark } from "@/components/TikTokMark";
import type { EvidenceView } from "@/data/types";

function SourceLink({ url, children }: { url: string; children: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-accent-text hover:underline">
      <TikTokMark size={12} />
      {children}
    </a>
  );
}

/** What each kind of evidence is, and where its link goes. */
const KINDS: Record<EvidenceView["kind"], { title: string; link: string }> = {
  video: { title: "From the video", link: "Watch on TikTok" },
  creator: { title: "From the creator's profile", link: "Open profile on TikTok" },
  transcript: { title: "What is said in the video", link: "Watch on TikTok" },
  watch: { title: "What the video shows", link: "Watch on TikTok" },
};

function Body({ evidence }: { evidence: EvidenceView }) {
  const kind = KINDS[evidence.kind];
  return (
    <>
      <p className="font-medium">{kind.title}</p>
      {evidence.excerpt !== null && <p className="max-h-40 overflow-y-auto break-words text-fg-muted">{evidence.excerpt}</p>}
      <SourceLink url={evidence.url}>{kind.link}</SourceLink>
    </>
  );
}

/** The evidence one criterion points at: what it is, a short excerpt when there is one, and the page on TikTok. */
export function Evidence({ evidence, id }: { evidence: EvidenceView | null; id: string | null }) {
  return (
    <div className="space-y-1.5 rounded-control border bg-bg p-3 text-small">
      {evidence === null ? (
        <p className="text-fg-muted">{id === null ? "No evidence was cited for this." : "The cited evidence is not shown here."}</p>
      ) : (
        <Body evidence={evidence} />
      )}
    </div>
  );
}
