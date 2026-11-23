"use client";

import { useState } from "react";

/** Whether a video cover can be shown: there is a local copy and it has not failed to load. */
export function useCover(src: string | undefined): { shown: boolean; onError: () => void } {
  const [failed, setFailed] = useState(false);
  return { shown: src !== undefined && !failed, onError: () => setFailed(true) };
}
