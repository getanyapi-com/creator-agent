import { sql } from "drizzle-orm";
import { bigint, customType, date, index, jsonb, numeric, pgSequence, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/**
 * Each server process takes one number from here at start and holds a Postgres advisory lock on it while
 * it lives (`src/db/owner.ts`). It starts at 2^32 so no lock keyed by `hashtext()`, which is a 32-bit
 * integer, can ever hold the same key.
 */
export const runOwners = pgSequence("run_owners", { startWith: 4294967296 });

/**
 * One row per live question. `record` is the core's private record (`RunOutput`) and never leaves the
 * server; `display` is the core's display object, the only answer a browser gets. `owner` is the process
 * researching a running question, so another process can tell a dead one's runs apart.
 */
export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    question: text("question").notNull(),
    status: text("status", { enum: ["running", "done", "failed"] }).notNull(),
    /** Why a failed run stopped, in plain words. */
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    askerId: text("asker_id").notNull(),
    /** free: public, asked on the house; wallet: private to the asker, its data paid from the asker's AnyAPI wallet. */
    tier: text("tier", { enum: ["free", "wallet"] }).notNull().default("free"),
    /** Why a wallet run's data calls stopped part-way, when they did. */
    walletStop: text("wallet_stop", { enum: ["empty", "capped", "disconnected"] }),
    /** The process researching a running question, then the one saving a finished question's images. */
    owner: bigint("owner", { mode: "number" }).notNull(),
    /** Set when the asker took the thread down. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    record: jsonb("record"),
    display: jsonb("display"),
    progress: jsonb("progress").notNull(),
    /** When every image of a finished run had been tried; null while the save is unfinished. */
    mediaSavedAt: timestamp("media_saved_at", { withTimezone: true }),
  },
  (t) => [
    index("runs_status_idx").on(t.status),
    index("runs_started_at_idx").on(t.startedAt),
    // An account's own questions, newest first by a backward scan, without the removed ones (`askedRuns`).
    index("runs_asker_started_at_idx").on(t.askerId, t.startedAt).where(sql`${t.removedAt} is null`),
  ],
);

/** One row per question an account asked; a question given back is deleted. */
export const questionClaims = pgTable(
  "question_claims",
  {
    runId: text("run_id").primaryKey(),
    accountId: text("account_id").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [index("question_claims_account_at_idx").on(t.accountId, t.at)],
);

/** What the house keys spent, per UTC day, kind and run, at the price each call was billed: an amount the run sets, never adds to (`src/server/live/houseSpend.ts`). */
export const houseSpend = pgTable(
  "house_spend",
  {
    day: date("day", { mode: "string" }).notNull(),
    kind: text("kind", { enum: ["data", "model"] }).notNull(),
    runId: text("run_id").notNull(),
    usd: numeric("usd").notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.kind, t.runId] })],
);

/** A finished run's saved avatars and covers, kept because TikTok's own links expire within hours. */
export const runMedia = pgTable(
  "run_media",
  {
    runId: text("run_id").notNull(),
    /** avatar-<handle> or video-<id>, with the extension of its type. */
    file: text("file").notNull(),
    type: text("type").notNull(),
    bytes: bytea("bytes").notNull(),
  },
  (t) => [primaryKey({ columns: [t.runId, t.file] })],
);

/**
 * One AnyAPI wallet connection per account, as lurk keeps it (`src/db/schema/tenant.ts`): the refresh token and the
 * short-lived access token, each encrypted with APP_ENCRYPTION_KEY (`src/server/wallet/crypto.ts`). No AnyAPI key is stored.
 */
export const walletConnections = pgTable("wallet_connections", {
  accountId: text("account_id").primaryKey(),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});
