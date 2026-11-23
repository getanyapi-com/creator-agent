/**
 * Where the watch sidebar goes and how big its video is, from the window size. The video is always as
 * tall as the window allows at TikTok's 9:16 shape; the sidebar is as wide as that video.
 */

/**
 * The narrowest the page beside the sidebar may get: Tailwind's `sm` (640px), the width at which these
 * pages leave their phone layout. A window that cannot keep the page this wide next to the sidebar gets
 * the drawer from the bottom instead.
 */
export const PAGE_MIN = 640;

/** The details column beside the video (criteria, evidence, views). */
export const DETAILS_WIDTH = 360;

/**
 * The narrowest the sidebar gets, whatever the video's width: the header row (face, handle, place in the
 * list, previous, next, close) and the actions row (Reveal, Details, Watch on TikTok) on one line each.
 * Measured on 2026-11-21 in Chromium with the app's fonts: the actions row is the wider, 300px of
 * content (Reveal 81, Details 82, the link 121, two 8px gaps), plus the 16px gutter on each side.
 */
export const PANEL_MIN = 332;

/** The page's own side gutter (px-4), used around the video too. */
export const GUTTER = 16;

export interface Viewport {
  width: number;
  height: number;
}

export interface WatchLayout {
  mode: "side" | "drawer";
  /** Below the dev bar in dev builds; 0 in production. */
  top: number;
  panelWidth: number;
  videoWidth: number;
  videoHeight: number;
  /** The details sit in a column beside the video; otherwise they are below it, reached by scrolling. */
  detailsBeside: boolean;
}

/** `chrome` is the measured height of everything in the sidebar's column that is not the video. */
export function watchLayout(viewport: Viewport, top: number, chrome: number): WatchLayout {
  const tall = Math.max(0, viewport.height - top - chrome - GUTTER);
  const sideVideoWidth = Math.round((tall * 9) / 16);
  const panelWidth = Math.max(PANEL_MIN, sideVideoWidth + 2 * GUTTER);
  if (viewport.width - panelWidth >= PAGE_MIN) {
    return {
      mode: "side",
      top,
      panelWidth,
      videoWidth: sideVideoWidth,
      videoHeight: tall,
      detailsBeside: viewport.width - panelWidth - DETAILS_WIDTH >= PAGE_MIN,
    };
  }
  // The drawer spans the window's width, so the video may also be limited by that.
  const videoWidth = Math.min(sideVideoWidth, viewport.width - 2 * GUTTER);
  const videoHeight = videoWidth === sideVideoWidth ? tall : Math.round((videoWidth * 16) / 9);
  return { mode: "drawer", top, panelWidth: viewport.width, videoWidth, videoHeight, detailsBeside: false };
}
