/**
 * Where the checks write: never the app's own database (lurk's `tests/testDatabase.ts`). TEST_DATABASE_URL
 * wins when set; otherwise a sibling of DATABASE_URL named `<database>_test` on the same server, which the
 * global setup creates and migrates. With neither, the checks stop and say so rather than skip.
 */
export function testDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
  if (!env.DATABASE_URL) throw new Error("Set TEST_DATABASE_URL, or DATABASE_URL in web/.env.local, to run the checks against Postgres");
  const url = new URL(env.DATABASE_URL);
  const name = url.pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) url.pathname = `/${name}_test`;
  return url.toString();
}

/** The development settings, as `next dev` reads them, when this checkout has them. */
export function loadLocalEnv(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No local settings: TEST_DATABASE_URL must be set.
  }
}
