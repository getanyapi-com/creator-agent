import { z } from "zod";

/** An unset variable and one set to nothing mean the same thing in a .env file (lurk's `src/lib/config.ts`). */
const blankIsAbsent = (value: unknown) => (value === "" ? undefined : value);

const bool = z.preprocess(
  blankIsAbsent,
  z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
);

/** Optional text: absent, or set to something. */
const optional = z.preprocess(blankIsAbsent, z.string().min(1).optional());

/** 32 random bytes, base64, as lurk's `src/lib/crypto.ts` reads it. */
const KEY_BYTES = 32;

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    /** The public origin; the OAuth redirect registered at AnyAPI is `<APP_URL>/connect/callback` (lurk `src/lib/config.ts`). */
    APP_URL: z.preprocess(blankIsAbsent, z.url().default("http://localhost:3000")).transform((url) => url.replace(/\/+$/, "")),
    /** Encrypts stored AnyAPI refresh and access tokens; needed only when wallets can connect. */
    APP_ENCRYPTION_KEY: optional.refine((key) => key === undefined || Buffer.from(key, "base64").length === KEY_BYTES, `APP_ENCRYPTION_KEY must be ${KEY_BYTES} random bytes, base64`),
    /** Printed by `pnpm --filter web anyapi:register`. Unset: no wallet can connect and every account is free. */
    ANYAPI_OAUTH_CLIENT_ID: optional,
    /** true on a self-hosted instance: removes the per-account question limit. */
    SELF_HOSTED: bool,
    /** The AnyAPI key free questions run on. */
    ANYAPI_HOUSE_API_KEY: z.string().min(1),
    /** The Surplus Intelligence key the models run on. */
    SURPLUS_API_KEY: z.string().min(1),
    /** Daily ceilings on what the house spends, in USD, by UTC day: lurk's defaults (lurk `src/lib/config.ts`). */
    HOUSE_DATA_CAP_USD_PER_DAY: z.preprocess(blankIsAbsent, z.coerce.number().nonnegative().default(50)),
    HOUSE_LLM_CAP_USD_PER_DAY: z.preprocess(blankIsAbsent, z.coerce.number().nonnegative().default(100)),
    /** The longest question accepted, in characters. No default: the instance's owner sets it. */
    MAX_QUESTION_CHARS: z.coerce.number().int().positive(),
    /**
     * Questions researched at once across the whole instance; the next asker is told to try again later.
     * Default 8, the hosted instance's value, sized on 2026-11-21 so its questions together stay inside the
     * call rate the pinned TikTok source served reliably. A question makes about 35 calls to that source, at
     * most 10 at a time (`TOOL_PARALLELISM`). An instance on its own AnyAPI key can change it.
     */
    RUNS_IN_FLIGHT: z.preprocess(blankIsAbsent, z.coerce.number().int().positive().default(8)),
  })
  .refine((env) => env.ANYAPI_OAUTH_CLIENT_ID === undefined || env.APP_ENCRYPTION_KEY !== undefined, "APP_ENCRYPTION_KEY is required when ANYAPI_OAUTH_CLIENT_ID is set");

export type Config = z.infer<typeof schema>;

/** The environment, checked where it is read; a missing required setting fails the request that needs it. */
export function config(): Config {
  return schema.parse(process.env);
}
