"use client";

import { Check, CircleHelp, X, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { CriterionState, CriterionView, EvidenceView } from "@/data/types";
import { Evidence } from "@/components/Evidence";

const STATE: Record<CriterionState, { label: string; icon: LucideIcon; tone: string }> = {
  supported: { label: "Supported", icon: Check, tone: "text-supported" },
  unknown: { label: "Unknown", icon: CircleHelp, tone: "text-unknown" },
  contradicted: { label: "Contradicted", icon: X, tone: "text-contradicted" },
};

/** What was asked of this creator, each marked supported, unknown or contradicted; the picked one's evidence beneath. */
export function Criteria({ criteria, evidence }: { criteria: CriterionView[]; evidence: Record<string, EvidenceView> }) {
  const [picked, setPicked] = useState(0);
  const current = criteria[picked];
  if (current === undefined) return <p className="text-small text-fg-muted">No criteria were checked for this creator.</p>;
  return (
    <div>
      <ul className="space-y-1" role="list">
        {criteria.map((criterion, index) => {
          const state = STATE[criterion.state];
          const Icon = state.icon;
          const active = index === picked;
          return (
            <li key={index}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setPicked(index)}
                className={`flex w-full items-start gap-2.5 rounded-control px-2.5 py-1.5 text-left text-small transition-motion ${active ? "bg-accent-soft" : "hover:bg-surface-2"}`}
              >
                <Icon size={15} className={`mt-0.5 shrink-0 ${state.tone}`} aria-hidden />
                <span className="min-w-0 flex-1">{criterion.text}</span>
                <span className={`shrink-0 text-small font-medium ${state.tone}`}>{state.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2">
        <Evidence evidence={current.evidenceId === null ? null : (evidence[current.evidenceId] ?? null)} id={current.evidenceId} />
      </div>
    </div>
  );
}
