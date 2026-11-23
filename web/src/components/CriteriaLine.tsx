/** The checks applied to every creator and what they left out, as the core's code wrote them; nothing when there were none. */
export function CriteriaLine({ text, className = "" }: { text: string | null; className?: string }) {
  if (text === null) return null;
  return <p className={`text-small text-fg-muted ${className}`}>{text}</p>;
}
