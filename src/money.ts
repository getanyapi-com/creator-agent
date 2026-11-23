/** Dollars with at least cents and at most four decimals: $0.10, $0.005, $0.0006, $2.00. */
export function formatUsd(usd: number): string {
  return `$${usd.toFixed(4).replace(/0{1,2}$/, "")}`;
}
