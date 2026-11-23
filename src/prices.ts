import type { FetchFn } from "./anyapi.ts";
import { ANYAPI_BASE_URL, ENDPOINTS, type Endpoint } from "./endpoints.ts";

/** The table states prices to four decimals, so a published price within half that step is a match. */
const ROUNDING_USD = 0.00005;

export type PriceTable = Record<Endpoint, number>;

interface PublishedApi {
  lanes?: { source?: { id?: string }; pricing?: { maxUsd?: number } }[];
}

/**
 * Reads each endpoint's published price for its pinned source, throws when one differs from the
 * table by more than rounding, and returns the published prices: those are what each call reserves.
 */
export async function readPublishedPrices(key: string, fetchFn: FetchFn = fetch): Promise<PriceTable> {
  const problems: string[] = [];
  const prices = {} as PriceTable;
  for (const endpoint of Object.keys(ENDPOINTS) as Endpoint[]) {
    const { source, priceUsd } = ENDPOINTS[endpoint];
    const res = await fetchFn(`${ANYAPI_BASE_URL}/v1/apis/${endpoint}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      problems.push(`${endpoint}: catalog answered HTTP ${res.status}`);
      continue;
    }
    const api = (await res.json()) as PublishedApi;
    const lane = api.lanes?.find((l) => l.source?.id === source);
    const published = lane?.pricing?.maxUsd;
    if (typeof published !== "number") {
      problems.push(`${endpoint}: source ${source} is not published`);
    } else if (Math.abs(published - priceUsd) > ROUNDING_USD) {
      problems.push(`${endpoint}: published $${published}, table $${priceUsd}`);
    } else {
      prices[endpoint] = published;
    }
  }
  if (problems.length > 0) throw new Error(`Published prices differ from the table:\n${problems.join("\n")}`);
  return prices;
}

/** The table itself, for tests and offline re-scoring. */
export function tablePrices(): PriceTable {
  return Object.fromEntries(Object.entries(ENDPOINTS).map(([e, spec]) => [e, spec.priceUsd])) as PriceTable;
}
