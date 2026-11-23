/** What this app asks a wallet for: running data calls and reading the balance (lurk's `src/lib/oauth.ts`). Its own module so the register script can read it with plain Node. */
export const OAUTH_SCOPE = "run balance:read";
