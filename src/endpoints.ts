/** The AnyAPI endpoints the agent may call, each pinned to one source at its published price. */
export const BISON = "anonymous-bison-cb2f8f3c";
export const FLAMINGO = "anonymous-flamingo";

export type Endpoint =
  | "tiktok.search_keyword"
  | "tiktok.profile"
  | "tiktok.profile_videos"
  | "tiktok.video"
  | "tiktok.video_download"
  | "tiktok.video_transcript";

export interface EndpointSpec {
  source: string;
  priceUsd: number;
}

/** Published prices as of 2026-11-20; checked against the live catalog before any run. */
export const ENDPOINTS: Record<Endpoint, EndpointSpec> = {
  "tiktok.search_keyword": { source: BISON, priceUsd: 0.0006 },
  "tiktok.profile": { source: BISON, priceUsd: 0.0004 },
  "tiktok.profile_videos": { source: BISON, priceUsd: 0.0006 },
  "tiktok.video": { source: BISON, priceUsd: 0.0004 },
  "tiktok.video_download": { source: BISON, priceUsd: 0.0008 },
  "tiktok.video_transcript": { source: FLAMINGO, priceUsd: 0.0011 },
};

/** `inspect_creator` reads the profile and the post list together. */
export const INSPECT_CREATOR_USD = ENDPOINTS["tiktok.profile"].priceUsd + ENDPOINTS["tiktok.profile_videos"].priceUsd;

export const ANYAPI_BASE_URL = "https://api.getanyapi.com";
