import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const viewports = [320, 375, 768, 1440] as const;
const schemes = ["light", "dark"] as const;
const artifactRoot = join(process.cwd(), "artifacts", "design-system");

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

test("creates current, responsive design-system evidence", async ({ page }) => {
  const startedAt = new Date().toISOString();
  const runId = startedAt.replaceAll(/[^\d]/g, "").slice(0, 14);
  const runDirectory = join(artifactRoot, runId);
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const results: Array<Record<string, unknown>> = [];

  await mkdir(runDirectory, { recursive: true });
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({ runId, startedAt, review: null }, null, 2));
  await page.route("**/*", async (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4319")) {
      await route.continue();
      return;
    }
    externalRequests.push(route.request().url());
    await route.abort();
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const colorScheme of schemes) {
    for (const width of viewports) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/design-system", { waitUntil: "domcontentloaded" });
      await page.evaluate(async () => document.fonts.ready);

      const focusTargets = page.locator('[data-ds-hit-target], [data-slot="table-container"][tabindex="0"]');
      const focusTargetCount = await focusTargets.count();
      const focusTraversal = [];
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      for (let index = 0; index < focusTargetCount; index += 1) {
        await page.keyboard.press("Tab");
        const focusTarget = focusTargets.nth(index);
        await expect(focusTarget).toBeFocused();
        const focusState = await focusTarget.evaluate((element, targetIndex) => {
          const rectangle = element.getBoundingClientRect();
          const styles = getComputedStyle(element);
          return {
            index: targetIndex,
            outlineWidth: Number.parseFloat(styles.outlineWidth),
            visible: rectangle.width > 0 && rectangle.height > 0 && rectangle.bottom > 0 && rectangle.top < window.innerHeight,
            focusVisible: element.matches(":focus-visible"),
          };
        }, index);
        expect(focusState.visible).toBe(true);
        expect(focusState.focusVisible).toBe(true);
        expect(focusState.outlineWidth).toBeGreaterThanOrEqual(2);
        focusTraversal.push(focusState);
      }

      const measured = await page.evaluate(() => {
        const selectors = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
        const hits = selectors("[data-ds-hit-target]");
        const statuses = selectors("[data-ds-status]");
        const prose = selectors("[data-ds-prose]");
        const reference = document.createElement("span");
        reference.textContent = "0".repeat(65);
        reference.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:inherit";
        document.body.append(reference);
        const maxProseWidth = reference.getBoundingClientRect().width;
        reference.remove();
        return {
          bodyFont: getComputedStyle(document.body).fontFamily,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          hitTargets: hits.map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
          primaryActions: selectors("[data-ds-section]").map((section) => section.querySelectorAll('[data-slot=button][data-variant="default"]').length),
          statusCues: statuses.map((status) => Boolean(status.querySelector("[data-ds-status-cue]"))),
          proseWidths: prose.map((element) => element.getBoundingClientRect().width),
          maxProseWidth,
        };
      });
      const axe = await new AxeBuilder({ page }).analyze();
      const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));

      expect(measured.overflow).toBe(false);
      expect(measured.bodyFont).toContain("IBM Plex Sans");
      expect(measured.hitTargets.length).toBeGreaterThan(0);
      expect(measured.hitTargets.every(({ width: targetWidth, height }) => targetWidth >= 44 && height >= 44)).toBe(true);
      expect(measured.primaryActions.every((count) => count <= 1)).toBe(true);
      expect(measured.statusCues.every(Boolean)).toBe(true);
      expect(measured.proseWidths.every((proseWidth) => proseWidth <= measured.maxProseWidth)).toBe(true);
      expect(focusTargetCount).toBeGreaterThan(0);
      expect(severeAxe).toEqual([]);
      expect(externalRequests).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);

      const screenshot = join(runDirectory, `design-system-${colorScheme}-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({ colorScheme, width, screenshot: screenshot.slice(process.cwd().length + 1), measured, focusTraversal, severeAxe });
    }
  }

  const resultsPath = join(runDirectory, "assertions.json");
  await writeFile(resultsPath, JSON.stringify(results, null, 2));
  const pngs = await Promise.all(results.map(async ({ screenshot }) => {
    const path = join(process.cwd(), String(screenshot));
    const [contents, metadata] = await Promise.all([readFile(path), stat(path)]);
    return { path: String(screenshot), bytes: metadata.size, sha256: sha256(contents), mtimeMs: metadata.mtimeMs };
  }));
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const assertions = await readFile(resultsPath);
  const manifest = { runId, startedAt, gitHead, assertions: resultsPath.slice(process.cwd().length + 1), assertionsSha256: sha256(assertions), pngs };
  const manifestPath = join(runDirectory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({ runId, startedAt, manifest: manifestPath.slice(process.cwd().length + 1) }, null, 2));
  console.log(`DESIGN_SYSTEM_EVIDENCE_RUN=${runId}`);
});
