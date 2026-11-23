import { siTiktok } from "simple-icons";

/** TikTok's own mark, drawn in the current text colour. */
export function TikTokMark({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg role="img" aria-label="TikTok" viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor">
      <path d={siTiktok.path} />
    </svg>
  );
}
