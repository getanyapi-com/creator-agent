import { Eye, FileText, ListChecks, MessageSquareText, Search, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import type { ReplayStep, StepKind } from "@/data/types";
import { formatUsd } from "@/lib/format";

const ICONS: Record<StepKind, LucideIcon> = {
  think: MessageSquareText,
  search: Search,
  creator: UserRound,
  transcript: FileText,
  watch: Eye,
  answer: ListChecks,
  check: ShieldCheck,
};

/** Research steps: what was searched or inspected, what came back, and the money spent by then. */
export function StepList({ steps }: { steps: readonly ReplayStep[] }) {
  return (
    <ol className="divide-y">
      {steps.map((step, index) => {
        const Icon = ICONS[step.kind];
        return (
          <li key={index} className="grid grid-cols-[16px_minmax(0,1fr)_auto] gap-x-3 py-2 text-small">
            <Icon size={15} className={`mt-0.5 ${step.failed ? "text-contradicted" : "text-fg-subtle"}`} aria-hidden />
            <div className="min-w-0">
              <p className="break-words">{step.label}</p>
              {step.detail !== null && <p className={step.failed ? "text-contradicted" : "text-fg-muted"}>{step.detail}</p>}
            </div>
            <span className="pt-0.5 font-mono text-mono text-fg-subtle">{formatUsd(step.runningUsd)}</span>
          </li>
        );
      })}
    </ol>
  );
}
