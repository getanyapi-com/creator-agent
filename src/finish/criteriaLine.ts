import type { Excluded } from "./applyChecks.ts";
import { checkLabel, type Check } from "./checks.ts";

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The thresholds the answer used, in plain words with their figures, written by the code from the
 * declared checks (the model may write no figures), and how many creators they left out. When the
 * intake step could not read the question's checks, the line says they are as the agent read the
 * question (round 4, F1). Null when the answer declared no check.
 */
export function criteriaLine(checks: Check[], excluded: Excluded, readBy: "code" | "agent"): string | null {
  if (checks.length === 0) return null;
  const asked = checks.filter((c) => c.from === "question").map(checkLabel);
  const assumed = checks.filter((c) => c.from === "assumption").map(checkLabel);
  const checked = readBy === "code" ? "Checked on every creator" : "Checked on every creator, as the agent read the question";
  const parts = [
    asked.length ? `${checked}: ${asked.join("; ")}.` : "",
    assumed.length ? `Assumed, not asked (a creator who misses these stays, marked): ${assumed.join("; ")}.` : "",
    excluded.count
      ? `Left out ${plural(excluded.count, "creator who misses", "creators who miss")} a check from the question (${excluded.byCheck.map((b) => `${b.count} miss "${b.check}"`).join(", ")}).`
      : "",
  ];
  return parts.filter(Boolean).join(" ");
}
