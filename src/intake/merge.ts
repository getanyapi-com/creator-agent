import type { Check } from "../finish/checks.ts";

/**
 * The question's checks with the agent's added (round 4, F1). The question's checks are fixed: an
 * agent check of a kind the question states is ignored, and every other agent check counts as an
 * assumption, whatever it says. With no question checks (the intake step failed), the agent's checks
 * stand as declared.
 */
export function withQuestionChecks(question: Check[] | null, agent: Check[]): Check[] {
  if (question === null) return agent;
  const kinds = new Set(question.map((c) => c.kind));
  return [...question, ...agent.filter((c) => !kinds.has(c.kind)).map((c): Check => ({ ...c, from: "assumption" }))];
}
