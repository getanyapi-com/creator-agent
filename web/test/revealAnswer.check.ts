import { expect, test } from "vitest";
import { WALLET_UNREACHABLE } from "@/auth/tier";
import { revealAnswer } from "@/lib/reveal";

// The Reveal route answers 503 with WALLET_UNREACHABLE when AnyAPI cannot be asked about the wallet (src/app/api/reveal/route.ts).
test("Reveal reads the route's could-not-check answer as try again, not as a creator with no public email", async () => {
  const unreachable = Response.json({ error: WALLET_UNREACHABLE }, { status: 503 });
  expect(await revealAnswer(unreachable)).toEqual({ kind: "retry", message: WALLET_UNREACHABLE });
});

test("any other failed answer still reads as no public email, and a good answer as itself", async () => {
  expect(await revealAnswer(Response.json({ error: "No such question." }, { status: 404 }))).toEqual({ kind: "none" });
  expect(await revealAnswer(Response.json({ kind: "needs-wallet" }))).toEqual({ kind: "needs-wallet" });
});
