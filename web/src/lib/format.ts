/** Display formats shared by the pages. Money is always dollars and cents, never credits. */
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const WHOLE = new Intl.NumberFormat("en-US");
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const STAMP = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** Whole cents print as $0.10; smaller amounts keep a tenth of a cent so a 10 cent limit stays readable. */
export function formatUsd(usd: number): string {
  if (usd > 0 && usd < 0.001) return "under $0.001";
  const wholeCents = Math.abs(usd * 100 - Math.round(usd * 100)) < 1e-9;
  return `$${usd.toFixed(wholeCents || usd >= 1 ? 2 : 3)}`;
}

export function formatCount(value: number | null): string {
  return value === null ? "unknown" : COMPACT.format(value);
}

/** Followers under 10,000 print in full ("3,626"), since "3.6K" reads as "36K" at tile size; larger counts shorten like any count. */
export function formatFollowers(value: number | null): string {
  return value !== null && value < 10_000 ? WHOLE.format(value) : formatCount(value);
}

export function formatDay(utcSeconds: number | null): string | null {
  return utcSeconds === null ? null : DAY.format(new Date(utcSeconds * 1000));
}

export function formatStamp(iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : `${STAMP.format(date)} UTC`;
}

export function formatDuration(ms: number | null): string | null {
  if (ms === null) return null;
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds % 60}s`;
}

export function formatRatio(ratio: number): string {
  return `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}x`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${WHOLE.format(count)} ${count === 1 ? one : many}`;
}
