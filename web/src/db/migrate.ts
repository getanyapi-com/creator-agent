import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Applies web/drizzle/ to DATABASE_URL and exits; the image runs it before the server starts (lurk's `src/db/migrate.ts`).
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();
console.log("migrations applied");
