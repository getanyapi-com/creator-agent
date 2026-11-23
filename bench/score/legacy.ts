import { NO_INTAKE } from "../../src/intake/intake.ts";
import type { RunOutput } from "../../src/trace.ts";

/**
 * A run saved before round 4 lacks the fields the display object and the gate read: the contact list,
 * the sentence labels, the closing calls and each step's start and cost. The bench fills them so it
 * can score round 3's passes: no contacts were kept, no sentence was labelled, the gate never ran
 * (so the display falls back to patterns only), and steps carry no time or cost.
 */
export function upgradeRecord(output: RunOutput): RunOutput {
  const o = output as Partial<RunOutput> & RunOutput;
  // Saved before the intake step (round 4, F1): it never ran, so the agent's checks stood as declared.
  if (o.gate !== undefined) return o.intake === undefined ? { ...o, intake: NO_INTAKE } : output;
  return {
    ...o,
    intake: NO_INTAKE,
    contacts: {},
    verify: null,
    gate: { path: "patterns", reason: "the run was saved before the gate existed", removed: [], call: null },
    answer: { ...o.answer, sentenceLabels: {} },
    costs: { ...o.costs, houseUsd: 0 },
    trace: o.trace.map((t) => ({ ...t, startedMs: 0, toolCalls: t.toolCalls.map((c) => ({ ...c, startedMs: 0, costUsd: 0 })) })),
  };
}
