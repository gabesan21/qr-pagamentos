import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const viewports = [320, 375, 768, 1440] as const;
const schemes = ["light", "dark"] as const;
const artifactRoot = join(process.cwd(), "artifacts", "admin");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";

function sha256(value: Buffer | string) { return createHash("sha256").update(value).digest("hex"); }

test("creates current authenticated responsive admin evidence", async ({ page }) => {
  test.skip(!baseUrl || !process.env.ADMIN_EVIDENCE_USERNAME || !process.env.ADMIN_EVIDENCE_PASSWORD, "requires the disposable admin evidence runtime");
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
    if (route.request().url() === `${baseUrl}/login/submit`) {
      const response = await route.fetch({ maxRedirects: 0 });
      const headers = response.headers();
      if (headers.location) {
        const location = new URL(headers.location);
        headers.location = `${baseUrl}${location.pathname}${location.search}`;
      }
      return route.fulfill({ response, headers });
    }
    if (route.request().url().startsWith(baseUrl)) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/Nome de usuário|Username/).fill(process.env.ADMIN_EVIDENCE_USERNAME!);
  await page.getByLabel(/Senha|Password/).fill(process.env.ADMIN_EVIDENCE_PASSWORD!);
  await Promise.all([page.waitForURL(`${baseUrl}/`), page.getByRole("button", { name: /Entrar|Sign in/ }).click()]);

  for (const colorScheme of schemes) {
    for (const width of viewports) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseUrl}/admin?success=changed`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await page.evaluate(async () => document.fonts.ready);
      const focusTraversal = [];
      await page.getByRole("heading", { level: 1 }).click();
      for (let index = 0; index < 4; index += 1) {
        await page.keyboard.press("Tab");
        focusTraversal.push(await page.evaluate(() => {
          const element = document.activeElement as HTMLElement;
          const rectangle = element.getBoundingClientRect();
          return { tag: element.tagName, visible: rectangle.width > 0 && rectangle.height >= 44, focusVisible: element.matches(":focus-visible"), outline: Number.parseFloat(getComputedStyle(element).outlineWidth) };
        }));
      }
      expect(focusTraversal.every((item) => item.visible && item.focusVisible && item.outline >= 2)).toBe(true);
      const measured = await page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('button, input, select, [role="checkbox"]')).filter((element) => element.getBoundingClientRect().width > 0);
        const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
        return {
          bodyFont: getComputedStyle(document.body).fontFamily,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          targets: controls.map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
          labels: Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([aria-hidden="true"]), select')).filter((control) => control.getBoundingClientRect().width > 0).map((control) => control.labels?.length ?? 0),
          actions: forms.map((form) => ({ action: new URL(form.action).pathname, method: form.method })),
          statusCues: Boolean(document.querySelector('[role="status"] svg')),
          locale: document.documentElement.lang,
        };
      });
      const axe = await new AxeBuilder({ page }).analyze();
      const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
      expect(measured.bodyFont).toContain("IBM Plex Sans");
      expect(measured.overflow).toBe(false);
      expect(measured.targets.length).toBeGreaterThan(0);
      expect(measured.targets.every(({ width: targetWidth, height }) => targetWidth >= 44 && height >= 44)).toBe(true);
      expect(measured.labels.every((count) => count > 0)).toBe(true);
      expect(measured.actions.every(({ method }) => method === "post")).toBe(true);
      expect(measured.statusCues).toBe(true);
      expect(["pt-BR", "en"]).toContain(measured.locale);
      expect(severeAxe).toEqual([]);
      expect(externalRequests).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);

      const roleSelect = page.locator('form[action$="/role"] select').first();
      await roleSelect.selectOption("USER");
      await page.locator('form[action$="/role"]').first().getByRole("button", { name: /Salvar função|Save role/ }).click();
      await expect(page.getByRole("alert").filter({ hasText: /Confirmar remoção|Confirm administrator demotion/ })).toBeVisible();
      const screenshot = join(runDirectory, `admin-${colorScheme}-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({ colorScheme, width, screenshot: screenshot.slice(process.cwd().length + 1), measured, focusTraversal, severeAxe, confirmation: true });
      await page.getByRole("button", { name: /Cancelar|Cancel/ }).click();
    }
  }

  const resultsPath = join(runDirectory, "assertions.json");
  await writeFile(resultsPath, JSON.stringify(results, null, 2));
  const pngs = await Promise.all(results.map(async ({ screenshot }) => {
    const artifactPath = join(process.cwd(), String(screenshot));
    const [contents, metadata] = await Promise.all([readFile(artifactPath), stat(artifactPath)]);
    return { path: String(screenshot), bytes: metadata.size, sha256: sha256(contents), mtimeMs: metadata.mtimeMs };
  }));
  const assertions = await readFile(resultsPath);
  const manifest = { runId, startedAt, gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), assertions: resultsPath.slice(process.cwd().length + 1), assertionsSha256: sha256(assertions), pngs };
  const manifestPath = join(runDirectory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({ runId, startedAt, manifest: manifestPath.slice(process.cwd().length + 1) }, null, 2));
  console.log(`ADMIN_EVIDENCE_RUN=${runId}`);
});
