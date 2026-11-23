/**
 * TikTok's Embed Player (developers.tiktok.com/doc/embed-player): an iframe at /player/v1/<video id>
 * that talks to the page through window.postMessage, every message marked `x-tiktok-player`.
 */
export const PLAYER_ORIGIN = "https://www.tiktok.com";

/**
 * Starts on load, since the player is only added when the reader asks for it, and loops, since TikTok's
 * default stops on the last frame. Related videos come from the same creator; the caption and music line
 * are already on our page. The fullscreen button is hidden because the iframe is not allowed fullscreen.
 * The volume button stays (TikTok's default), so a reader whose browser forces a muted start can turn it up.
 */
const PARAMS = "autoplay=1&loop=1&rel=0&description=0&music_info=0&fullscreen_button=0";

export function playerUrl(videoId: string): string {
  return `${PLAYER_ORIGIN}/player/v1/${encodeURIComponent(videoId)}?${PARAMS}`;
}

/** The player's `onStateChange` values, as documented. */
export const PLAYER_STATE = { init: -1, ended: 0, playing: 1, paused: 2, buffering: 3 } as const;

/** TikTok's `onPlayerError` code for a start the browser's autoplay rules refused. */
export const AUTOPLAY_ERROR = 3002;

/** What the player reports that the page acts on. */
export type PlayerEvent =
  | { kind: "ready" }
  | { kind: "state"; state: number }
  | { kind: "mute"; muted: boolean }
  | { kind: "error"; code: number | null };

/** Reads one message from the player, or null for anything else. */
export function readPlayerMessage(event: MessageEvent, frame: HTMLIFrameElement | null): PlayerEvent | null {
  if (event.origin !== PLAYER_ORIGIN || frame === null || event.source !== frame.contentWindow) return null;
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null || !("x-tiktok-player" in data) || !("type" in data)) return null;
  const value = "value" in data ? data.value : undefined;
  if (data.type === "onPlayerReady") return { kind: "ready" };
  if (data.type === "onStateChange" && typeof value === "number") return { kind: "state", state: value };
  if (data.type === "onMute" && typeof value === "boolean") return { kind: "mute", muted: value };
  if (data.type !== "onPlayerError") return null;
  const detail = typeof value === "object" && value !== null ? value : {};
  return { kind: "error", code: "errorCode" in detail && typeof detail.errorCode === "number" ? detail.errorCode : null };
}

/** Sends a control message to the player. */
export function tellPlayer(frame: HTMLIFrameElement | null, type: "play" | "mute" | "unMute") {
  frame?.contentWindow?.postMessage({ type, "x-tiktok-player": true }, PLAYER_ORIGIN);
}
