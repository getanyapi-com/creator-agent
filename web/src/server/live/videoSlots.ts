import { limiter } from "../../../../src/concurrency.ts";
import type { VideoSlot } from "../../../../src/tools/context.ts";
import { config } from "@/server/config";

/** Next bundles this module once per layer, so the one limit lives on globalThis and the whole process shares it, as the database pool does. */
const holder = globalThis as typeof globalThis & { __creatorVideoSlots?: VideoSlot };

/**
 * Where every question's video inspections wait for room under VIDEO_INSPECTIONS_AT_ONCE, first come first served;
 * undefined when the setting is unset, so each runs at once.
 */
export function videoSlot(): VideoSlot | undefined {
  const limit = config().VIDEO_INSPECTIONS_AT_ONCE;
  if (limit === undefined) return undefined;
  holder.__creatorVideoSlots ??= limiter(limit);
  return holder.__creatorVideoSlots;
}
