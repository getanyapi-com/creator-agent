"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** ThemeScript has written the attribute before hydration. */
function read(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** The page theme, which follows the system until the viewer picks one. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as const);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked; the theme still applies for this page.
    }
    listeners.forEach((listener) => listener());
  };
  return { theme, toggle };
}
