import { accessSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const playwrightBinary = join(root, "node_modules", ".bin", "playwright");

try {
  accessSync(playwrightBinary);
} catch {
  console.error("PLAYWRIGHT_UNAVAILABLE");
  process.exit(1);
}

const { chromium } = await import("playwright");
const artifacts = join(root, "artifacts");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 320, height: 800 }, reducedMotion: "reduce" });

mkdirSync(artifacts, { recursive: true });
for (const colorScheme of ["light", "dark"]) {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:3000/en/design-system", { waitUntil: "networkidle" });
  await page.screenshot({ path: join(artifacts, `1.3.1-design-system-${colorScheme}-320.png`), fullPage: true });
}

await browser.close();
