import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { walletConnections } from "@/db/schema";
import { config } from "@/server/config";
import { walletBalanceUsd } from "./balance";
import { decryptSecret, encryptSecret } from "./crypto";
import { ConnectionEndedError, OAuthUnavailableError, refreshTokens, revokeToken, type TokenResponse } from "./oauth";

/**
 * An account's AnyAPI wallet connection, as lurk keeps it (`src/lib/anyapi.ts`): both tokens encrypted with
 * APP_ENCRYPTION_KEY, the access token refreshed when it is about to expire. A connection AnyAPI no longer
 * honours is deleted the moment a refresh says so, which puts the account back on the free tier.
 */

/** lurk's margin: an access token this close to expiry is refreshed first, so it cannot expire on the way to AnyAPI. */
const EXPIRY_SKEW_MS = 60_000;

type Row = typeof walletConnections.$inferSelect;

function encryptionKey(): string {
  const key = config().APP_ENCRYPTION_KEY;
  if (key === undefined) throw new Error("APP_ENCRYPTION_KEY is not set");
  return key;
}

function sealed(tokens: TokenResponse, key: string) {
  return {
    refreshToken: encryptSecret(tokens.refresh_token, key),
    accessToken: encryptSecret(tokens.access_token, key),
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scope: tokens.scope,
  };
}

/** Whether this account has a wallet connection row. Reads no token, so it is for showing the tier only, never for granting it. */
export async function walletConnected(accountId: string): Promise<boolean> {
  const rows = await db().select({ one: sql`1` }).from(walletConnections).where(eq(walletConnections.accountId, accountId)).limit(1);
  return rows.length > 0;
}

/** Stores a freshly issued token pair for an account, replacing any it had. */
export async function saveWalletTokens(accountId: string, tokens: TokenResponse): Promise<void> {
  const values = { accountId, ...sealed(tokens, encryptionKey()), connectedAt: new Date() };
  await db().insert(walletConnections).values(values).onConflictDoUpdate({ target: walletConnections.accountId, set: values });
}

function heldAccessToken(row: Row, key: string, rejected: string | null): string | null {
  const live = row.accessToken !== null && row.accessTokenExpiresAt !== null && row.accessTokenExpiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (!live || row.accessToken === null) return null;
  const token = decryptSecret(row.accessToken, key);
  return token === rejected ? null : token;
}

/**
 * A live access token for the account, or null when it has no connection. `rejected` is a token AnyAPI just
 * refused, which is refreshed even if it has not expired. AnyAPI rotates the refresh token on every use and
 * treats a second use of an old one as theft (lurk), so the row is locked for the exchange and whoever waited
 * reads what the first one stored. Throws ConnectionEndedError, after deleting the connection, when AnyAPI
 * no longer honours it, or when the connection this request read is gone by the time it holds the lock (whoever
 * held it before just deleted it), and OAuthUnavailableError, keeping it, when AnyAPI could not be asked. `signal` is the
 * calling data request's: when it aborts, or the OAuth deadline passes, the refresh gives up and the row lock goes.
 */
export async function walletAccessToken(accountId: string, rejected: string | null = null, signal?: AbortSignal): Promise<string | null> {
  const key = encryptionKey();
  const [row] = await db().select().from(walletConnections).where(eq(walletConnections.accountId, accountId));
  if (row === undefined) return null;
  const held = heldAccessToken(row, key, rejected);
  if (held !== null) return held;
  const outcome = await db().transaction(async (tx) => {
    const [locked] = await tx.select().from(walletConnections).where(eq(walletConnections.accountId, accountId)).for("update");
    if (locked === undefined) return { ended: new ConnectionEndedError() };
    const stored = heldAccessToken(locked, key, rejected);
    if (stored !== null) return { token: stored };
    try {
      const tokens = await refreshTokens(decryptSecret(locked.refreshToken, key), signal);
      await tx.update(walletConnections).set(sealed(tokens, key)).where(eq(walletConnections.accountId, accountId));
      return { token: tokens.access_token };
    } catch (err) {
      if (!(err instanceof ConnectionEndedError)) throw err;
      await tx.delete(walletConnections).where(eq(walletConnections.accountId, accountId));
      return { ended: err };
    }
  });
  if ("ended" in outcome) throw outcome.ended;
  return outcome.token;
}

/** What a wallet connection may grant right now: AnyAPI's word on its grant, with the wallet's balance, or why there is none. */
export type WalletStanding = { balanceUsd: number } | "none" | "ended" | "unreachable";

/**
 * What the account's wallet connection may grant right now, as AnyAPI says at this moment: the access token
 * (an expired one refreshed first) is shown to AnyAPI on its free balance read, which answers with the wallet's
 * balance. A token AnyAPI refuses is refreshed once and shown again. `none` means there is no connection;
 * `ended` means AnyAPI refused the refresh and the connection was deleted, by this request or by one that held
 * it a moment before; `unreachable` means AnyAPI could not be asked, or refused a token it had just issued: the
 * connection is kept and nothing is granted.
 */
export async function walletStanding(accountId: string): Promise<WalletStanding> {
  try {
    const held = await walletAccessToken(accountId);
    if (held === null) return "none";
    const balance = await walletBalanceUsd(held);
    if (balance !== "invalid") return { balanceUsd: balance };
    // This request read the connection a moment ago, so finding none now means another request just saw it end.
    const fresh = await walletAccessToken(accountId, held);
    if (fresh === null) return "ended";
    const again = await walletBalanceUsd(fresh);
    return again === "invalid" ? "unreachable" : { balanceUsd: again };
  } catch (err) {
    if (err instanceof ConnectionEndedError) return "ended";
    if (err instanceof OAuthUnavailableError) return "unreachable";
    throw err;
  }
}

/**
 * Deletes the account's connection here, then asks AnyAPI to revoke it, best effort (lurk's
 * `disconnectWalletAction`). A revoke AnyAPI does not confirm within the OAuth deadline leaves the grant live
 * at AnyAPI until its refresh token expires or the user ends it there; no copy of its tokens is left here.
 */
export async function disconnectWallet(accountId: string): Promise<void> {
  const [row] = await db().delete(walletConnections).where(eq(walletConnections.accountId, accountId)).returning();
  if (row === undefined) return;
  if (!(await revokeToken(decryptSecret(row.refreshToken, encryptionKey())))) {
    console.error(`wallet disconnect for ${accountId}: AnyAPI did not confirm the revoke; the grant stays live there until it expires or is ended there`);
  }
}
