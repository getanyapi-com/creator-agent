"use client";

import { DEV_TOOLS, useViewState, type ViewPatch } from "./useViewState";

interface Choice {
  label: string;
  active: boolean;
  patch: ViewPatch;
}

function Group({ title, choices, onPick }: { title: string; choices: Choice[]; onPick: (patch: ViewPatch) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={title}>
      <span className="text-dev-fg-muted">{title}</span>
      {choices.map((choice) => (
        <button
          key={choice.label}
          type="button"
          aria-pressed={choice.active}
          onClick={() => onPick(choice.patch)}
          className={
            choice.active
              ? "rounded-md bg-dev-active px-2 py-0.5 font-medium text-dev-active-fg"
              : "rounded-md px-2 py-0.5 text-dev-fg hover:bg-dev-hover"
          }
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

/** Dev-only controls for tier and viewer. Never rendered in a production build. */
export function DevBar() {
  const [state, update] = useViewState();
  if (!DEV_TOOLS) return null;
  return (
    <div className="sticky top-0 z-50 border-b border-dev-border bg-dev-bg font-mono text-mono text-dev-fg" data-devbar>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-1.5">
        <span className="font-semibold">DEV</span>
        <Group
          title="Tier"
          onPick={update}
          choices={[
            { label: "Account", active: state.tier === null, patch: { tier: null } },
            { label: "Free", active: state.tier === "free", patch: { tier: "free" } },
            { label: "Wallet", active: state.tier === "wallet", patch: { tier: "wallet" } },
          ]}
        />
        <Group
          title="Viewer"
          onPick={update}
          choices={[
            { label: "Account", active: state.asker === null, patch: { as: null } },
            { label: "Visitor", active: state.asker === false, patch: { as: "visitor" } },
            { label: "Asker", active: state.asker === true, patch: { as: "asker" } },
          ]}
        />
      </div>
    </div>
  );
}
