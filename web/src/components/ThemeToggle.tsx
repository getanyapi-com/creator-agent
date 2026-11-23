"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/useTheme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex size-9 items-center justify-center rounded-control text-fg-muted transition-motion hover:bg-surface-2 hover:text-fg"
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
