import { sql } from "drizzle-orm";
import { beforeAll, vi } from "vitest";
import { db } from "@/db";
import type { FetchFn } from "../../src/anyapi.ts";
import type { Budget } from "../../src/budget.ts";
import { loadLocalEnv, testDatabaseUrl } from "./testDatabase";

// The checks use the test database (test/testDatabase.ts), no key that could be billed, and the Compose default question length.
loadLocalEnv();
process.env.DATABASE_URL = testDatabaseUrl(process.env);
process.env.ANYAPI_HOUSE_API_KEY = "check-key-never-sent";
process.env.SURPLUS_API_KEY = "check-key-never-sent";
process.env.MAX_QUESTION_CHARS = "500";
process.env.SELF_HOSTED = "false";

// No check reaches a real service: research runs on fakes, and any outbound fetch fails.
globalThis.fetch = () => Promise.reject(new Error("No network in checks"));

vi.mock("@/auth/session", async () => {
  const { fake } = await import("./fakeServer");
  return { viewerId: async () => fake.user, signInRequired: () => Response.json({ error: "Sign in first." }, { status: 401 }) };
});

// A wallet run's data client keeps the run's wallet fetch, so a check sees the wallet path; prices are the core's table.
vi.mock("@/server/live/services", async (importOriginal) => {
  const { fake } = await import("./fakeServer");
  const { AnyApiClient } = await import("../../src/index.ts");
  const { tablePrices } = await import("../../src/prices.ts");
  return {
    ...(await importOriginal<typeof import("@/server/live/services")>()),
    runServices: async (walletFetch: FetchFn | null = null) => {
      if (fake.services === null) throw new Error("No services set by this check");
      return walletFetch === null ? fake.services : { ...fake.services, anyapi: (budget: Budget) => new AnyApiClient("set-per-call", budget, tablePrices(), walletFetch) };
    },
  };
});

// Check files run one at a time (vitest.config.ts) and each starts from empty tables, since the instance-wide limits count every row.
beforeAll(async () => {
  await db().execute(sql`truncate runs, question_claims, house_spend, run_media, wallet_connections`);
});
