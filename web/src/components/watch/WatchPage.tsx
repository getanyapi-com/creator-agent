"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ThreadView } from "@/data/types";
import { useRevealContact, type RevealResult } from "@/lib/reveal";
import { WatchContext, type WatchApi, type WatchItem } from "./WatchContext";
import { DETAILS_WIDTH, watchLayout } from "./watchLayout";
import { WatchSidebar } from "./WatchSidebar";
import { useWindowFrame } from "./useWindowFrame";

interface Entry {
  element: HTMLElement;
  item: WatchItem;
}

interface Watching {
  id: string;
  item: WatchItem;
  index: number;
  total: number;
  /** Goes up with every pick, so each pick mounts a fresh player. */
  pick: number;
}

interface Props {
  thread: ThreadView;
  children: ReactNode;
}

function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** The covers on the page in reading order: the order they appear in the document. */
function inReadingOrder(entries: Map<string, Entry>): string[] {
  return [...entries.entries()]
    .sort(([, a], [, b]) => (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map(([id]) => id);
}

/**
 * A thread page whose videos play in the watch sidebar. Every cover inside joins one list; previous and
 * next (buttons, J and K, or the left and right arrows) walk it across sections, Esc closes. While the
 * sidebar is open on a wide window the page moves over beside it, keeping the cover the reader clicked
 * where it was on screen. Reveal results live here so a tile and the sidebar never ask twice.
 */
export function WatchPage({ thread, children }: Props) {
  const entries = useRef(new Map<string, Entry>());
  const [watching, setWatching] = useState<Watching | null>(null);
  const current = useRef<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chrome, setChrome] = useState(0);
  const [reveals, setReveals] = useState<Record<string, RevealResult>>({});
  const revealContact = useRevealContact();
  const closeRef = useRef<HTMLButtonElement>(null);
  // Set when a tile opens the sidebar, so focus moves to its close button then and not on previous or next.
  const focusClose = useRef(false);
  const anchor = useRef<{ element: HTMLElement; top: number } | null>(null);
  const frame = useWindowFrame(watching !== null);
  const layout = watchLayout(frame.viewport, frame.devBar, chrome);
  const byProof = useMemo(() => new Map(thread.creators.flatMap((c) => (c.proof === null ? [] : [[c.proof.id, c] as const]))), [thread.creators]);

  const holdPlace = (element: HTMLElement | undefined) => {
    if (element !== undefined) anchor.current = { element, top: element.getBoundingClientRect().top };
  };
  const show = useCallback(
    (id: string, scroll: boolean) => {
      const entry = entries.current.get(id);
      if (entry === undefined) return;
      const order = inReadingOrder(entries.current);
      const item = entry.item.creator === null ? { ...entry.item, creator: byProof.get(entry.item.video.id) ?? null } : entry.item;
      current.current = id;
      setWatching((now) => ({ id, item, index: order.indexOf(id), total: order.length, pick: (now?.pick ?? 0) + 1 }));
      if (scroll) entry.element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    },
    [byProof],
  );
  const close = useCallback(() => {
    const element = current.current === null ? undefined : entries.current.get(current.current)?.element;
    holdPlace(element);
    current.current = null;
    setWatching(null);
    element?.focus({ preventScroll: true });
  }, []);
  // Beside the sidebar the page follows along to the tile now playing; behind the drawer it stays put.
  const follow = layout.mode === "side";
  const step = useCallback(
    (delta: number) => {
      if (current.current === null) return;
      const order = inReadingOrder(entries.current);
      const next = order[order.indexOf(current.current) + delta];
      if (next !== undefined) show(next, follow);
    },
    [show, follow],
  );

  const register = useCallback<WatchApi["register"]>((id, element, item) => {
    entries.current.set(id, { element, item });
    return () => {
      entries.current.delete(id);
      // A cover that left the page for good (the thread was removed) takes its video with it; one that only re-registered is back by then.
      queueMicrotask(() => {
        if (current.current === id && !entries.current.has(id)) {
          current.current = null;
          setWatching(null);
        }
      });
    };
  }, []);
  const open = (id: string) => {
    if (id === current.current) return;
    const element = entries.current.get(id)?.element;
    if (current.current === null) holdPlace(element);
    focusClose.current = true;
    show(id, false);
  };
  const reveal = (handle: string) => void revealContact(handle).then((result) => setReveals((all) => ({ ...all, [handle]: result })));

  const side = watching !== null && layout.mode === "side";
  const shift = side ? layout.panelWidth + (layout.detailsBeside && detailsOpen ? DETAILS_WIDTH : 0) : 0;

  // After the page has moved over (or back), the cover the reader was looking at returns to where it was on
  // screen. The sidebar can settle its width over a few renders before the first paint (window size, then
  // its own measured height), so the place is held until the next frame, not just for one render.
  useLayoutEffect(() => {
    const held = anchor.current;
    if (held === null) return;
    const moved = held.element.getBoundingClientRect().top - held.top;
    if (moved !== 0) window.scrollBy({ top: moved, behavior: "instant" });
    const release = window.requestAnimationFrame(() => {
      if (anchor.current === held) anchor.current = null;
    });
    return () => window.cancelAnimationFrame(release);
  }, [shift, watching?.id]);

  const pick = watching?.pick;
  useEffect(() => {
    if (pick === undefined) return;
    // Previous or next keeps focus where it is, unless that button has just become disabled at the end of the list.
    const focused = document.activeElement;
    const lost = focused === null || focused === document.body || (focused instanceof HTMLButtonElement && focused.disabled);
    if (focusClose.current || lost) closeRef.current?.focus({ preventScroll: true });
    focusClose.current = false;
  }, [pick]);

  const isOpen = watching !== null;
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return close();
      if (event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return;
      const key = event.key.toLowerCase();
      const delta = key === "j" || key === "arrowright" ? 1 : key === "k" || key === "arrowleft" ? -1 : 0;
      if (delta === 0) return;
      event.preventDefault();
      step(delta);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close, step]);

  const api: WatchApi = { register, open, watching: watching?.id ?? null, reveals, reveal };
  return (
    <WatchContext value={api}>
      <div style={{ paddingRight: shift === 0 ? undefined : shift }}>
        {children}
      </div>
      {watching !== null && (
        <WatchSidebar
          item={watching.item}
          playKey={`${watching.id}-${watching.pick}`}
          index={watching.index}
          total={watching.total}
          layout={layout}
          detailsOpen={detailsOpen}
          onDetails={(next) => {
            holdPlace(entries.current.get(watching.id)?.element);
            setDetailsOpen(next);
          }}
          onChrome={setChrome}
          onStep={step}
          onClose={close}
          closeRef={closeRef}
          evidence={thread.evidence}
          reveals={reveals}
          onReveal={reveal}
        />
      )}
    </WatchContext>
  );
}
