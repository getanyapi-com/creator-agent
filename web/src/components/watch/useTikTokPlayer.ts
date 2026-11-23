"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { AUTOPLAY_ERROR, PLAYER_STATE, readPlayerMessage, tellPlayer } from "@/lib/tiktokPlayer";

/**
 * How long after the player's page has loaded its ready message may take before the sidebar says it did
 * not load. Measured on 2026-11-21 in headless Chromium on all 85 fixture and saved-run videos: every
 * player turned ready, the slowest 10.6 s after the iframe's load event (median 0.4 s); this is that,
 * rounded up to a whole second. The note goes away if the player turns ready later.
 */
const READY_AFTER_LOAD_MS = 11_000;

/** What the player itself last reported; nothing here is guessed from our side. */
export type PlayerStatus = "loading" | "ready" | "playing" | "paused" | "buffering" | "refused" | "not-loaded";

const FROM_STATE: Record<number, PlayerStatus> = {
  [PLAYER_STATE.playing]: "playing",
  [PLAYER_STATE.paused]: "paused",
  [PLAYER_STATE.buffering]: "buffering",
};

/**
 * Listens to one mounted TikTok player. TikTok starts an autoplaying video muted when the browser will
 * not allow sound, so once it plays the page asks it to unmute: that works where the reader's click
 * counts as permission, and the player keeps reporting muted where it does not. A browser that pauses a
 * video it was asked to unmute gets it back playing muted; one that refuses the start gets a muted start.
 * `silent` is true only when the browser kept the sound off, until the reader turns it on with TikTok's
 * speaker button; a reader who mutes it themselves is not told anything.
 */
export function useTikTokPlayer(
  frame: RefObject<HTMLIFrameElement | null>,
  loaded: boolean,
): { status: PlayerStatus; muted: boolean | null; silent: boolean } {
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [muted, setMuted] = useState<boolean | null>(null);
  const [silent, setSilent] = useState(false);
  const unmute = useRef<"not-yet" | "asked" | "settled">("not-yet");
  const reportedMuted = useRef<boolean | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = readPlayerMessage(event, frame.current);
      if (message === null) return;
      if (message.kind === "ready") setStatus((now) => (now === "loading" || now === "not-loaded" ? "ready" : now));
      else if (message.kind === "mute") {
        // The answer to our unmute, either way: unmuted, or still muted because the browser said no.
        if (unmute.current === "asked") {
          unmute.current = "settled";
          setSilent(message.muted);
        } else if (!message.muted) setSilent(false);
        reportedMuted.current = message.muted;
        setMuted(message.muted);
      } else if (message.kind === "error") {
        if (message.code !== AUTOPLAY_ERROR) return setStatus("refused");
        unmute.current = "settled";
        setSilent(true);
        tellPlayer(frame.current, "mute");
        tellPlayer(frame.current, "play");
      } else {
        const next = FROM_STATE[message.state];
        if (next === undefined) return;
        if (next === "paused" && unmute.current === "asked") {
          unmute.current = "settled";
          setSilent(true);
          tellPlayer(frame.current, "mute");
          tellPlayer(frame.current, "play");
          return;
        }
        if (next === "playing" && unmute.current === "not-yet") {
          // Already playing with sound: nothing to ask.
          unmute.current = reportedMuted.current === false ? "settled" : "asked";
          if (unmute.current === "asked") tellPlayer(frame.current, "unMute");
        }
        setStatus((now) => (now === "refused" ? now : next));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frame]);

  useEffect(() => {
    if (!loaded || status !== "loading") return;
    const timer = window.setTimeout(() => setStatus("not-loaded"), READY_AFTER_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, status]);

  return { status, muted, silent };
}
