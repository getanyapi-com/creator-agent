"use client";

import { useSearchParams } from "next/navigation";
import { DEV_TOOLS } from "./useViewState";

function useDevHref(): (path: string) => string {
  const query = useSearchParams().toString();
  return (path) => (query === "" ? path : `${path}?${query}`);
}

function usePlainHref(): (path: string) => string {
  return (path) => path;
}

/** Builds internal links. In dev they carry the dev bar's choices, so moving between pages keeps the tier and viewer. */
export const useHref = DEV_TOOLS ? useDevHref : usePlainHref;
