import { Play } from "lucide-react";

/** The round play mark on a cover whose video plays on this page. */
export function PlayGlyph({ size = 40 }: { size?: number }) {
  return (
    <span
      className="absolute top-1/2 left-1/2 flex -translate-1/2 items-center justify-center rounded-full bg-media-chip text-media-fg transition-motion group-hover:scale-105"
      style={{ width: size, height: size }}
    >
      <Play size={Math.round(size * 0.4)} fill="currentColor" aria-hidden />
    </span>
  );
}
