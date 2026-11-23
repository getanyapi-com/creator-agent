"use client";

import { useRef, useState, type PointerEvent } from "react";

/**
 * Dragging the drawer down by its top strip (grab handle and header row). Released further down than
 * that strip is tall, the drawer closes; released sooner, it springs back. The strip's own height is the
 * distance: once the whole grab area has left its place the reader has clearly pulled it away.
 */
export function useDrawerDrag(onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ y: number; reach: number } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    // A press on a control in the strip (a link, a button) is that control's, not a drag.
    if ((event.target as HTMLElement).closest("a, button") !== null) return;
    start.current = { y: event.clientY, reach: event.currentTarget.offsetHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (start.current !== null) setOffset(Math.max(0, event.clientY - start.current.y));
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const begun = start.current;
    start.current = null;
    if (begun === null) return;
    const moved = event.clientY - begun.y;
    setOffset(0);
    if (moved > begun.reach) onClose();
  };
  return { offset, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } };
}
