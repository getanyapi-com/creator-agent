import { readFileSync } from "node:fs";
import { AnyApiClient } from "../src/anyapi.ts";
import type { Budget } from "../src/budget.ts";
import { SurplusChat } from "../src/llm.ts";
import { AGENT_MODELS, CONTACT_SCAN_MODEL, VERIFIER_MODEL, VIDEO_MODELS } from "../src/models.ts";
import { readPublishedPrices } from "../src/prices.ts";
import type { Services } from "../src/session.ts";

/** The bench judge, with reasoning (round 4, C3). */
export const DEFAULT_JUDGE_MODEL = "glm-5.3-flash";
/** The bench's second contact scan of the display object, a different model from the gate it checks (round 4, C4). */
export const SECOND_SCAN_MODEL = "deepseek-v4.1-flash";

export function readKey(envName: string): string {
  const path = process.env[envName];
  if (!path) throw new Error(`${envName} must name the file that holds the key`);
  const key = readFileSync(path, "utf8").trim();
  if (!key) throw new Error(`${envName} names an empty file`);
  return key;
}

export function liveChat(): SurplusChat {
  return new SurplusChat(readKey("SURPLUS_KEY_FILE"));
}

/** Live clients from the key files, reserving each data call at the price the catalog publishes now. */
export async function liveServices(): Promise<Services> {
  const anyapiKey = readKey("ANYAPI_KEY_FILE");
  const prices = await readPublishedPrices(anyapiKey);
  const llm = liveChat();
  const models = [...AGENT_MODELS, VIDEO_MODELS.primary, VIDEO_MODELS.fallback, VERIFIER_MODEL, CONTACT_SCAN_MODEL];
  return {
    anyapi: (budget: Budget) => new AnyApiClient(anyapiKey, budget, prices),
    llm,
    agentModels: AGENT_MODELS,
    videoModels: VIDEO_MODELS,
    verifierModel: VERIFIER_MODEL,
    contactScanModel: CONTACT_SCAN_MODEL,
    modelPrices: await llm.listPrices([...new Set(models)]),
    clockMs: () => Date.now(),
  };
}
