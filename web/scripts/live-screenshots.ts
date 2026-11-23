// Live questions through the browser, against a running dev server (default http://localhost:3400).
//   node scripts/live-screenshots.ts ask "<question>"   types the question into the front page ask box, prints the new thread id
//   node scripts/live-screenshots.ts shoot <id> <label>  captures /t/<id> (or the front page for "home") in light and dark, desktop and phone,
//                                                        into web/screenshots/live-<label>-<theme>-<size>.png
// Screenshots are taken on the free tier, so no Reveal result is ever in them.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";

const WEB_DIR = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(WEB_DIR, "screenshots");
const BASE = process.env.BASE_URL ?? "http://localhost:3400";
const THEMES = ["light", "dark"] as const;
const SIZES = { desktop: devices["Desktop Chrome"], phone: devices["iPhone 13"] };

async function ask(question: string): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASE);
  await page.locator("#ask").fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.waitForURL(/\/t\/[0-9a-f]{12}/);
  console.log(/\/t\/([0-9a-f]{12})/.exec(page.url())?.[1]);
  await browser.close();
}

async function shoot(id: string, label: string): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  for (const theme of THEMES) {
    for (const [size, device] of Object.entries(SIZES)) {
      const context = await browser.newContext({ ...device, colorScheme: theme });
      const page = await context.newPage();
      await page.goto(`${BASE}${id === "home" ? "/" : `/t/${id}`}`);
      const skip = page.getByRole("button", { name: "Skip to answer" });
      // A click before hydration does nothing, so it is repeated until the replay has ended.
      while (await skip.isVisible()) await skip.click();
      await page.waitForFunction(() => [...document.images].every((image) => image.complete));
      await page.evaluate(async () => {
        await document.fonts.ready;
        window.scrollTo(0, 0);
      });
      const file = path.join(OUT_DIR, `live-${label}-${theme}-${size}.png`);
      await page.screenshot({ path: file, fullPage: true, caret: "initial" });
      console.log(path.relative(WEB_DIR, file));
      await context.close();
    }
  }
  await browser.close();
}

const [command, first, second] = process.argv.slice(2);
if (command === "ask" && first !== undefined) await ask(first);
else if (command === "shoot" && first !== undefined && second !== undefined) await shoot(first, second);
else throw new Error('Usage: live-screenshots.ts ask "<question>" | shoot <id> <label>');
