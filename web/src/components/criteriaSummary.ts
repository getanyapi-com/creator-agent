import type { CriterionView } from "@/data/types";

/** How many of the asked-for things the evidence supports, in a few words. */
export function criteriaSummary(criteria: readonly CriterionView[]): { met: string; contradicted: number } {
  if (criteria.length === 0) return { met: "No criteria checked", contradicted: 0 };
  const supported = criteria.filter((c) => c.state === "supported").length;
  return {
    met: `${supported} of ${criteria.length} ${criteria.length === 1 ? "criterion" : "criteria"} met`,
    contradicted: criteria.filter((c) => c.state === "contradicted").length,
  };
}
