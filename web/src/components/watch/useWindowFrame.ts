"use client";

import { useLayoutEffect, useState } from "react";
import type { Viewport } from "./watchLayout";

/** The window's size and the dev bar's height (0 when there is none), kept current while `active`. */
export function useWindowFrame(active: boolean): { viewport: Viewport; devBar: number } {
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [devBar, setDevBar] = useState(0);

  // Before paint, so the sidebar never shows a frame laid out for a zero-size window.
  useLayoutEffect(() => {
    if (!active) return;
    // The width without a scrollbar, which is what a fixed sidebar and the page share.
    const onResize = () => setViewport({ width: document.documentElement.clientWidth, height: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    const bar = document.querySelector<HTMLElement>("[data-devbar]");
    const measure = () => setDevBar(bar?.offsetHeight ?? 0);
    measure();
    const observer = new ResizeObserver(measure);
    if (bar !== null) observer.observe(bar);
    return () => {
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
  }, [active]);

  return { viewport, devBar };
}
