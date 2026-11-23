/** What a signed-in account has left of today's free questions; `opensAt` is set only when none is left. */
export interface Allowance {
  limit: number;
  left: number;
  opensAt: string | null;
}

/** When the next question opens, in the reader's own clock: "at 3:40 PM" today, "tomorrow at 9:05 AM" after midnight. */
export function formatOpensAt(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return at.toDateString() === now.toDateString() ? `at ${time}` : `tomorrow at ${time}`;
}

/** The plain message when an account asks with no question left, worded in the browser so the time is the reader's. */
export function noneLeftMessage(allowance: Allowance): string {
  const used = `You have used your ${allowance.limit} free questions for today.`;
  return allowance.opensAt === null ? used : `${used} Your next one opens ${formatOpensAt(allowance.opensAt)}.`;
}
