import type { Tier } from "../answer.ts";
import type { Budget } from "../budget.ts";
import { ENDPOINTS } from "../endpoints.ts";
import { formatUsd } from "../money.ts";

export interface SearchStats {
  searches: number;
  creatorsChecked: number;
}

const CHEAPEST_CALL_USD = Math.min(...Object.values(ENDPOINTS).map((e) => e.priceUsd));

/** True when the limit, not the evidence, ended the search: a call was refused or none fits any more. */
export function budgetEndedSearch(budget: Budget): boolean {
  return budget.refusedCalls > 0 || budget.spendableUsd < CHEAPEST_CALL_USD;
}

/** The plain-words sentence the answer carries whenever the budget cut the research short. */
export function budgetNote(tier: Tier, budget: Budget, stats: SearchStats): string | null {
  if (!budgetEndedSearch(budget)) return null;
  const work = `${stats.searches} searches and ${stats.creatorsChecked} creators checked`;
  if (tier.kind === "free") {
    return `Since you're on the free tier (${formatUsd(budget.limitUsd)} per question), I stopped after ${work}; a larger budget would let me look further.`;
  }
  return `Your budget of ${formatUsd(budget.limitUsd)} ran out after ${work}; a larger budget would let me look further.`;
}
