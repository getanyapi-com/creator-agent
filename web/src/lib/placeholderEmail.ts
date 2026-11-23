/** Recorded runs carry no contacts and real ones must never be added, so the wallet tier reveals a made-up example.com address. */
export function placeholderEmail(handle: string): string {
  return `${handle.replace(/[^a-z0-9]/gi, "").toLowerCase() || "creator"}@example.com`;
}
