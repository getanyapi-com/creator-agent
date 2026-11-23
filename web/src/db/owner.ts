import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { config } from "@/server/config";
import type { Db } from "./index";

const holder = globalThis as typeof globalThis & { __creatorOwner?: Promise<number> };

/**
 * This process's number, from the `run_owners` sequence, held under a Postgres session advisory lock on a
 * connection of its own for as long as the process lives. Postgres lets the lock go when that connection
 * ends, which it does when the process dies, so whether a running question's owner is alive is a fact
 * the database knows, with no timeout to choose. The connection never idles out or ages out
 * (`idle_timeout` and `max_lifetime` 0), since either would let the lock go.
 *
 * If that connection ends while the process lives (a database restart, a failover, a terminated backend),
 * the lock is gone and the process's running questions no longer count toward RUNS_IN_FLIGHT. The process
 * then exits non-zero so its supervisor starts a fresh one, which takes a new lock; the questions this one
 * was running are then a dead owner's, which readers already end.
 */
export function processOwner(): Promise<number> {
  holder.__creatorOwner ??= (async () => {
    const conn = postgres(config().DATABASE_URL, { max: 1, idle_timeout: 0, max_lifetime: 0, onclose: ownerLost });
    const [row] = await conn<{ owner: string }[]>`select nextval('run_owners') as owner`;
    const owner = Number(row?.owner);
    await conn`select pg_advisory_lock(${owner})`;
    return owner;
  })();
  return holder.__creatorOwner;
}

function ownerLost(): void {
  console.error("The database connection holding this process's owner lock closed; exiting so a fresh process takes a new one.");
  process.exit(1);
}

/** This process's owner number, read inside `tx` with the database confirming its lock is still held; throws when it is not. */
export async function heldOwner(tx: Pick<Db, "execute">): Promise<number> {
  const owner = await processOwner();
  const [row] = await tx.execute<{ held: boolean }>(sql`select ${ownerAlive(owner)} as held`);
  if (row?.held !== true) throw new Error("This process no longer holds its owner lock.");
  return owner;
}

/**
 * True where `owner` names a process that still holds its lock in this database. A one-key advisory lock
 * shows in pg_locks as its high 32 bits in classid and low 32 bits in objid, with objsubid 1.
 */
export function ownerAlive(owner: AnyPgColumn | number): SQL<boolean> {
  return sql<boolean>`exists (
    select 1 from pg_locks l
    where l.locktype = 'advisory' and l.granted and l.objsubid = 1
      and l.database = (select oid from pg_database where datname = current_database())
      and ((l.classid::bigint << 32) | l.objid::bigint) = ${owner}
  )`;
}
