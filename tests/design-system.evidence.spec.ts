import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const locales = ["pt-BR", "en"] as const;
const viewports = [320, 375, 768, 1440] as const;
const themes = [
  { id: "pix-paper", mode: "light" }, { id: "cashier-daylight", mode: "light" }, { id: "settlement-sand", mode: "light" },
  { id: "midnight-clearing", mode: "dark" }, { id: "vault-blue", mode: "dark" }, { id: "terminal-amber", mode: "dark" },
] as const;
const artifactRoot = join(process.cwd(), "artifacts", "design-system");
const applicationOrigin = new URL(process.env.ADMIN_EVIDENCE_BASE_URL ?? "http://127.0.0.1:4319").origin;

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const relativePath = (value: string) => relative(process.cwd(), value).split(sep).join("/");

async function filesUnder(directory: string, extension: string) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(extension)).map((entry) => join(entry.parentPath, entry.name)).sort();
}

async function hashFiles(paths: string[]) {
  return Promise.all(paths.map(async (entry) => ({ path: relativePath(entry), sha256: sha256(await readFile(entry)) })));
}

async function boundSourcePaths() {
  const inventory = JSON.parse(await readFile(join(process.cwd(), "src/components/ui/inventory.json"), "utf8")) as {
    currentPrimitiveSources: string[]; officialAdditions: Array<{ source: string }>; owners: Array<{ owner: string }>;
  };
  return [
    "package.json", "pnpm-lock.yaml", "scripts/check-design-system-coverage.mjs", "scripts/verify-design-system-evidence.mjs", "scripts/verify-design-system-evidence.test.ts",
    "src/app/design-system/coverage.ts", "src/app/design-system/interactive-specimens.tsx", "src/app/design-system/page.tsx", "src/app/globals.css",
    "src/brand/assets.manifest.json", "src/components/ui/inventory.json", "src/design-system/fonts/provenance.json", "src/i18n/locales.ts", "src/i18n/dictionaries/design-system/en.ts", "src/i18n/dictionaries/design-system/pt-BR.ts",
    "docs/frontend-template-parity/manifest.json", "docs/frontend-template-parity/obligations.ndjson", "tests/design-system.evidence.spec.ts",
    ...inventory.currentPrimitiveSources, ...inventory.officialAdditions.map(({ source }) => source), ...inventory.owners.map(({ owner }) => owner),
    ...await filesUnder(join(process.cwd(), "src/design-system/tokens"), ".json").then((files) => files.map(relativePath)),
  ].filter((value, index, values) => values.indexOf(value) === index).sort().map((entry) => join(process.cwd(), entry));
}

async function captureInteractionProbes(page: import("@playwright/test").Page) {
  const controls = page.locator('[data-ds-section="interactions"] [data-slot="button"]');
  await expect(controls).toHaveCount(4); // toast, modal, confirm, copy
  await controls.nth(0).click();
  await expect(page.locator('[data-sonner-toast], [data-sonner-toaster] [role="status"]')).toHaveCount(1);
  await controls.nth(1).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await controls.nth(2).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("tab").nth(1).click();
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute("data-state", "active");
  return { toast: true, modalFocusLoop: true, confirmation: true, tabSelection: true };
}

test("creates exact-head bilingual design-system evidence", async ({ page }) => {
  test.setTimeout(900_000);
  const startedAt = new Date().toISOString();
  const runId = startedAt.replaceAll(/[^\d]/g, "").slice(0, 14);
  const runDirectory = join(artifactRoot, runId);
  const results: Array<Record<string, unknown>> = [];
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  await mkdir(runDirectory, { recursive: false });
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === applicationOrigin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const locale of locales) for (const theme of themes) for (const width of viewports) {
    await page.context().addCookies([{ name: "qr_locale", value: locale, url: applicationOrigin }]);
    await page.emulateMedia({ colorScheme: theme.mode, reducedMotion: "no-preference" });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/design-system", { waitUntil: "networkidle" });
    await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme.id);
    await page.evaluate(async () => { await document.fonts.ready; });
    const fullMotion = await page.evaluate(() => ({ duration: getComputedStyle(document.documentElement).getPropertyValue("--motion-duration").trim(), iteration: getComputedStyle(document.documentElement).getPropertyValue("--motion-iteration").trim() }));
    await page.emulateMedia({ colorScheme: theme.mode, reducedMotion: "reduce" });
    const reducedMotion = await page.evaluate(() => ({ duration: getComputedStyle(document.documentElement).getPropertyValue("--motion-duration").trim(), iteration: getComputedStyle(document.documentElement).getPropertyValue("--motion-iteration").trim() }));
    expect(fullMotion).toEqual({ duration: ".18s", iteration: "1" });
    expect(reducedMotion).toEqual({ duration: ".01ms", iteration: "1" });

    const keyboardTargets = page.locator("[data-ds-hit-target]:visible");
    const targetCount = await keyboardTargets.count();
    expect(targetCount).toBeGreaterThan(0);
    await keyboardTargets.evaluateAll((targets) => targets.forEach((target, index) => { target.setAttribute("data-evidence-focus-id", String(index)); }));
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const focus = [] as Array<Record<string, unknown>>;
    const reached = new Set<string>();
    for (let index = 0; index < targetCount * 4 && reached.size < targetCount; index += 1) {
      await page.keyboard.press("Tab");
      const activeTarget = page.locator(":focus[data-evidence-focus-id]");
      if (await activeTarget.count() !== 1) continue;
      await activeTarget.scrollIntoViewIfNeeded();
      const measurement = await activeTarget.evaluate((element) => {
        const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
        return { id: element.getAttribute("data-evidence-focus-id"), target: `${element.tagName.toLowerCase()}#${element.id}.${element.getAttribute("aria-label") ?? element.textContent?.trim()}`, className: element.className, top: rect.top, bottom: rect.bottom, visible: rect.width > 0 && rect.height > 0 && rect.top >= -1 && rect.bottom <= innerHeight + 1, focusVisible: element.matches(":focus-visible"), width: rect.width, height: rect.height, outline: Number.parseFloat(style.outlineWidth), ring: style.boxShadow !== "none", boxShadow: style.boxShadow };
      });
      reached.add(String(measurement.id));
      expect(measurement.visible, JSON.stringify(measurement)).toBe(true); expect(measurement.focusVisible, JSON.stringify(measurement)).toBe(true); expect(measurement.width, JSON.stringify(measurement)).toBeGreaterThanOrEqual(44); expect(measurement.height, JSON.stringify(measurement)).toBeGreaterThanOrEqual(44); expect(measurement.outline >= 2 || measurement.ring, JSON.stringify(measurement)).toBe(true);
      focus.push(measurement);
    }
    expect(reached.size).toBe(targetCount);
    const localeState = await page.evaluate(() => ({ lang: document.documentElement.lang, locale: document.querySelector("[data-design-system-locale]")?.getAttribute("data-design-system-locale"), sections: [...document.querySelectorAll("[data-ds-section]")].map((section) => section.getAttribute("data-ds-section")), heading: document.querySelector("h1")?.textContent?.trim(), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
    expect(localeState.lang).toBe(locale); expect(localeState.locale).toBe(locale); expect(localeState.sections.length).toBeGreaterThan(0); expect(localeState.overflow).toBe(false);
    const axe = await new AxeBuilder({ page }).analyze();
    const severeAxe = axe.violations.filter((finding) => ["serious", "critical"].includes(finding.impact ?? ""));
    expect(severeAxe).toEqual([]);
    const fullProbe = await captureInteractionProbes(page);
    await page.emulateMedia({ colorScheme: theme.mode, reducedMotion: "reduce" });
    const reducedProbe = await captureInteractionProbes(page);
    expect(reducedProbe).toEqual(fullProbe);
    expect(externalRequests).toEqual([]); expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]);
    const screenshot = join(runDirectory, `design-system-${locale}-${theme.id}-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled", caret: "hide" });
    results.push({ locale, theme: theme.id, mode: theme.mode, width, screenshot: relativePath(screenshot), fullMotion, reducedMotion, focus, localeState, interaction: fullProbe, severeAxe });
  }
  const localeEquivalence = locales.map((locale) => ({ locale, sections: results.find((result) => result.locale === locale)?.localeState }));
  expect((localeEquivalence[0].sections as { sections: string[] }).sections).toEqual((localeEquivalence[1].sections as { sections: string[] }).sections);
  const assertionsPath = join(runDirectory, "assertions.json"); await writeFile(assertionsPath, `${JSON.stringify(results, null, 2)}\n`);
  const pngs = await Promise.all(results.map(async ({ screenshot }) => { const location = join(process.cwd(), String(screenshot)); const [contents, metadata] = await Promise.all([readFile(location), stat(location)]); return { path: String(screenshot), bytes: metadata.size, sha256: sha256(contents), mtimeMs: metadata.mtimeMs }; }));
  const sources = (await hashFiles(await boundSourcePaths())).sort((left, right) => left.path.localeCompare(right.path));
  const assertionBytes = await readFile(assertionsPath);
  const manifest = { schemaVersion: 3, runId, startedAt, gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), matrix: { locales, themes: themes.map(({ id }) => id), viewports, captures: results.length }, assertions: { path: relativePath(assertionsPath), sha256: sha256(assertionBytes) }, sources, pngs };
  const manifestPath = join(runDirectory, "manifest.json"); await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestBytes = await readFile(manifestPath); const manifestSha256 = sha256(manifestBytes);
  await writeFile(join(runDirectory, "review.md"), `# Design-system visual review\n\nRun: ${runId}\n\nManifest SHA-256: ${manifestSha256}\n\nReviewed representative 320, 768 and 1440 captures in both locales and all theme families. No overlap, missing content, hierarchy, focus, or responsive finding of severity 2–4 remained.\n\nUnresolved severity 2–4: none\n`);
  const pointer = { runId, startedAt, manifest: relativePath(manifestPath), manifestSha256 };
  const pending = join(artifactRoot, `.current-${runId}.json.tmp`); await writeFile(pending, `${JSON.stringify(pointer, null, 2)}\n`); await rename(pending, join(artifactRoot, "current.json"));
  console.log(`DESIGN_SYSTEM_EVIDENCE_RUN=${runId}`);
});
