import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "@/server/config";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/** Next bundles this module once per layer, so the pool lives on globalThis and one process has one (lurk's `src/db/index.ts`). */
const holder = globalThis as typeof globalThis & { __creatorDb?: Db };

/**
 * One pooled Drizzle client for the process. Lurk's sizing, for the same Azure Postgres tier: the server
 * takes 50 connections and a deploy briefly runs two revisions, so the pool is small and lets idle ones go.
 */
export function db(): Db {
  if (!holder.__creatorDb) {
    const sql = postgres(config().DATABASE_URL, { max: 10, idle_timeout: 30 });
    holder.__creatorDb = drizzle(sql, { schema });
  }
  return holder.__creatorDb;
}
