import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { POST } from "@/app/api/reveal/route";
import { fake } from "./fakeServer";
import { seedRun } from "./seed";

const id = "aabbccddeeff";
const handle = "some_creator";
const email = "creator@example.com";

beforeAll(() =>
  seedRun({
    id,
    status: "done",
    display: { question: "Find creators", sections: [], creators: [{ handle, hasPublicEmail: true }], videos: [] },
    record: { contacts: { [handle]: [{ source: "bio", kind: "email", value: email }] } },
  }),
);
fake.user = "free_account";

const reveal = (tier: string) => POST(new Request("http://check.invalid/api/reveal", { method: "POST", body: JSON.stringify({ threadId: id, handle, tier }) }));

afterEach(() => {
  vi.unstubAllEnvs();
});

test("a production build answers a free account that claims the wallet tier with the free-tier answer and no address", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const body = await (await reveal("wallet")).text();
  expect(JSON.parse(body)).toEqual({ kind: "needs-wallet" });
  expect(body).not.toContain(email);
});

// Also shows the seeded run does reach Reveal, so the production check above is not passing by accident.
test("a development build honours the dev bar's tier choice", async () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(await (await reveal("wallet")).json()).toEqual({ kind: "revealed", email, placeholder: false });
  expect(await (await reveal("free")).json()).toEqual({ kind: "needs-wallet" });
});
