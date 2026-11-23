/**
 * Statuses that are refusals before anything ran (round 2 contract, A1: "such as 400, 401, 402, 404
 * minimum_discount_not_met, 429"): bad request, no key, no money, not found or no seller, rate limited.
 * Every other failure, a timeout or a lost response included, may have been charged.
 */
const NOT_RUN_STATUSES = new Set([400, 401, 402, 404, 429]);

export function provenNotRun(status: number): boolean {
  return NOT_RUN_STATUSES.has(status);
}
