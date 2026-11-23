import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Readiness for the deploy check: 200 once the database answers. No account needed, no cost. */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db().execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
