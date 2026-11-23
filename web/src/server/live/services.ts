import type { FetchFn } from "../../../../src/anyapi.ts";
import type { Budget } from "../../../../src/budget.ts";
import { AGENT_MODELS, AnyApiClient, CONTACT_SCAN_MODEL, readPublishedPrices, SurplusChat, VERIFIER_MODEL, VIDEO_MODELS, type Services } from "../../../../src/index.ts";
import { config } from "@/server/config";
import { pacedFetch } from "./callPace";
import type { SpendSnapshot } from "./houseSpend";

/** The key a wallet run's data client is built with; its fetch (`src/server/wallet/walletFetch.ts`) replaces it with the account's access token on every call. */
const WALLET_KEY = "set-per-call";

/**
 * Live clients for one run, reserving each data call at the price the catalog publishes now, as the bench's
 * `liveServices` does from its key files. The models always run on the house Surplus key. Data runs on the
 * house AnyAPI key, or, given a wallet's fetch, on the asker's wallet; either way each call waits its turn under
 * the process's one DATA_CALLS_PER_MINUTE pace (`pacedFetch`).
 */
export async function runServices(walletFetch: FetchFn | null = null): Promise<Services> {
  const { ANYAPI_HOUSE_API_KEY, SURPLUS_API_KEY } = config();
  const prices = await readPublishedPrices(ANYAPI_HOUSE_API_KEY);
  const llm = new SurplusChat(SURPLUS_API_KEY);
  const models = [...AGENT_MODELS, VIDEO_MODELS.primary, VIDEO_MODELS.fallback, VERIFIER_MODEL, CONTACT_SCAN_MODEL];
  return {
    anyapi: (budget) => (walletFetch === null ? new AnyApiClient(ANYAPI_HOUSE_API_KEY, budget, prices, pacedFetch) : new AnyApiClient(WALLET_KEY, budget, prices, walletFetch)),
    llm,
    agentModels: AGENT_MODELS,
    videoModels: VIDEO_MODELS,
    verifierModel: VERIFIER_MODEL,
    contactScanModel: CONTACT_SCAN_MODEL,
    modelPrices: await llm.listPrices([...new Set(models)]),
    clockMs: () => Date.now(),
  };
}

/**
 * The same services, with what the run has spent so far readable at any moment. The core opens the run's budget
 * through `anyapi`, so that is where it is read from. Model spend counts the house's overage (`Budget.houseUsd`),
 * which the house pays as well; which kinds the house pays on a tier is `houseKinds`'s to say.
 */
export function trackSpend(services: Services): { services: Services; spent: () => SpendSnapshot } {
  let budget: Budget | null = null;
  const anyapi: Services["anyapi"] = (opened) => {
    budget = opened;
    return services.anyapi(opened);
  };
  const spent = (): SpendSnapshot => {
    const b = budget;
    if (b === null) return { spent: { data: 0, model: 0 }, reserved: { data: 0, model: 0 } };
    return { spent: { data: b.dataUsd, model: b.modelUsd + b.houseUsd }, reserved: { data: b.unsettledUsd("data"), model: b.unsettledUsd("model") } };
  };
  return { services: { ...services, anyapi }, spent };
}
