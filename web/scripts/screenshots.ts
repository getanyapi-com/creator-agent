// Screenshots of the front page and two thread pages, in light and dark, at desktop and phone widths,
// into web/screenshots/. Starts its own `next dev` on a free port and stops it when done.
// Run from web/: `pnpm screenshots`.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { chromium, devices, type Browser } from "playwright";

const WEB_DIR = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(WEB_DIR, "screenshots");
const THREADS = ["claude-sub10k", "hooks-language"];
const THEMES = ["light", "dark"] as const;
const SIZES = { desktop: devices["Desktop Chrome"], phone: devices["iPhone 13"] };

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address !== null ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

function startDev(port: number) {
  const child = spawn(path.join(WEB_DIR, "node_modules/.bin/next"), ["dev", "-p", String(port)], {
    cwd: WEB_DIR,
    detached: true,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("Ready")) resolve();
    });
    child.once("exit", (code) => reject(new Error(`next dev exited with ${code}`)));
  });
  // The whole process group, so next dev's worker goes too.
  const stop = () => {
    if (child.pid !== undefined && child.exitCode === null) process.kill(-child.pid, "SIGTERM");
  };
  return { ready, stop };
}

async function capture(browser: Browser, base: string) {
  for (const theme of THEMES) {
    for (const [size, device] of Object.entries(SIZES)) {
      const context = await browser.newContext({ ...device, colorScheme: theme });
      const page = await context.newPage();
      for (const target of ["home", ...THREADS]) {
        const route = target === "home" ? "/" : `/t/${target}`;
        await page.goto(`${base}${route}`);
        if (target !== "home") {
          await page.getByRole("button", { name: "Skip to answer" }).click();
        }
        // A full-page capture starts from the top so the sticky dev bar sits there.
        await page.evaluate(async () => {
          await document.fonts.ready;
          window.scrollTo(0, 0);
        });
        const file = path.join(OUT_DIR, `${target}-${theme}-${size}.png`);
        // Playwright hides the caret by writing an inline caret-color onto every input. The front page can
        // still be hydrating here, so React would find a style it never rendered and report a mismatch.
        // Nothing on these pages is focused, so there is no caret to hide.
        await page.screenshot({ path: file, fullPage: true, caret: "initial" });
        console.log(path.relative(WEB_DIR, file));
      }
      await context.close();
    }
  }
}

async function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const port = await freePort();
  const dev = startDev(port);
  const browser = await chromium.launch();
  try {
    await dev.ready;
    await capture(browser, `http://localhost:${port}`);
  } finally {
    await browser.close();
    dev.stop();
  }
}

await main();
