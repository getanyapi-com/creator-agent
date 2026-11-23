"use client";

import { useSearchParams } from "next/navigation";
import type { Tier } from "@/data/types";

/** True in `next dev`, false in a production build, where the dev controls and URL overrides do not exist. */
export const DEV_TOOLS = process.env.NODE_ENV !== "production";

export interface ViewState {
  /** A dev override of the tier shown; null for the account's own. */
  tier: Tier | null;
  /** A dev override of who is looking: true for the asker, false for anyone else, null for the signed-in account as it is. */
  asker: boolean | null;
}

export type ViewPatch = Partial<Record<"tier" | "as", string | null>>;

function useUrlViewState(): [ViewState, (patch: ViewPatch) => void] {
  const params = useSearchParams();
  const state: ViewState = {
    tier: params.get("tier") === "wallet" ? "wallet" : params.get("tier") === "free" ? "free" : null,
    asker: params.get("as") === "asker" ? true : params.get("as") === "visitor" ? false : null,
  };
  // Next keeps useSearchParams in step with history.replaceState, so this switches without a reload.
  const update = (patch: ViewPatch) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query === "" ? "" : `?${query}`}`);
  };
  return [state, update];
}

const PRODUCTION_STATE: ViewState = { tier: null, asker: null };

function useProductionViewState(): [ViewState, (patch: ViewPatch) => void] {
  return [PRODUCTION_STATE, () => undefined];
}

/** Which tier and viewer to render: from the URL in dev, fixed defaults in production. */
export const useViewState = DEV_TOOLS ? useUrlViewState : useProductionViewState;
