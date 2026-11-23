import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Checks are named *.check.ts: the repository root's `vitest run` has no config and would pick up any *.test.ts here, without the @ alias.
// They share one test database and the limits count across it, so files run one at a time.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["test/**/*.check.ts"], setupFiles: ["test/setup.ts"], globalSetup: ["test/globalSetup.ts"], fileParallelism: false },
});
