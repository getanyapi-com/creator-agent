import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadLocalEnv, testDatabaseUrl } from "./testDatabase";

/** Runs once before the check files: creates the test database when it is missing and brings it up to date (lurk's `tests/globalSetup.ts`). */
export async function setup(): Promise<void> {
  loadLocalEnv();
  const url = new URL(testDatabaseUrl(process.env));
  const name = url.pathname.replace(/^\//, "");
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => undefined });
  try {
    const [row] = await sql`select 1 from pg_database where datname = ${name}`;
    if (!row) await sql.unsafe(`create database "${name.replaceAll('"', '""')}"`);
  } finally {
    await sql.end();
  }
  const target = postgres(url.toString(), { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(target), { migrationsFolder: "./drizzle" });
  } finally {
    await target.end();
  }
}
