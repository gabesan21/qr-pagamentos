import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const viewports = [320, 375, 768, 1440] as const;
const themes = [
  { id: "pix-paper", mode: "light" },
  { id: "cashier-daylight", mode: "light" },
  { id: "settlement-sand", mode: "light" },
  { id: "midnight-clearing", mode: "dark" },
  { id: "vault-blue", mode: "dark" },
  { id: "terminal-amber", mode: "dark" },
] as const;
const artifactRoot = join(process.cwd(), "artifacts", "design-system");
let pendingObservationId = 0;

async function beginPendingNauttSubmission(
  page: import("@playwright/test").Page,
  input: { action: string; buttonName: string; pendingLabel: string },
) {
  let releaseResponse = () => {};
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  let requestCount = 0;
  let reportFirstRequest = () => {};
  const firstRequest = new Promise<void>((resolve) => { reportFirstRequest = resolve; });
  let reportResponseCompleted = () => {};
  const responseCompleted = new Promise<void>((resolve) => { reportResponseCompleted = resolve; });
  const pendingRoute = async (route: import("@playwright/test").Route) => {
    if (new URL(route.request().url()).pathname !== input.action) {
      await route.fallback();
      return;
    }
    requestCount += 1;
    reportFirstRequest();
    await responseGate;
    await route.fulfill({ body: "", status: 204 });
    reportResponseCompleted();
  };
  await page.route("**/*", pendingRoute);

  const section = page.locator('[data-ds-section="specimen-pending"]');
  const submit = section.getByRole("button", { name: input.buttonName });
  const callbackName = `reportNauttPendingState${pendingObservationId++}`;
  let reportPendingState: (state: Record<string, unknown>) => void = () => {};
  const observedPendingState = new Promise<Record<string, unknown>>((resolve) => { reportPendingState = resolve; });
  await page.exposeFunction(callbackName, reportPendingState);
  await section.evaluate((element, { action, reportName }) => {
    const form = Array.from(element.querySelectorAll("form")).find((candidate) => new URL(candidate.action).pathname === action);
    const button = form?.querySelector<HTMLButtonElement>('[data-slot="button"]');
    if (!button) throw new Error(`Nautt submit control is missing for ${action}`);
    const observer = new MutationObserver(() => {
      if (button.getAttribute("aria-busy") !== "true") return;
      const controls = Array.from(element.querySelectorAll<HTMLInputElement | HTMLButtonElement>("[data-nautt-action-control]"));
      const state = {
        action,
        busy: button.getAttribute("aria-busy"),
        disabled: button.disabled,
        label: button.textContent?.trim(),
        spinners: button.querySelectorAll('[data-slot="spinner"]').length,
        controls: controls.length,
        allDisabled: controls.every((control) => control.disabled),
      };
      (window as unknown as Record<string, (value: typeof state) => void>)[reportName](state);
      observer.disconnect();
    });
    observer.observe(element, { attributes: true, childList: true, subtree: true });
  }, { action: input.action, reportName: callbackName });
  await submit.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });
  const [, pendingState] = await Promise.all([firstRequest, observedPendingState]);
  expect(pendingState).toMatchObject({ action: input.action, busy: "true", disabled: true, label: input.pendingLabel, spinners: 1, allDisabled: true });
  await page.waitForTimeout(100);
  expect(requestCount).toBe(1);

  return {
    pendingState: { ...pendingState, requestCount },
    async release() {
      releaseResponse();
      await responseCompleted;
      await page.unroute("**/*", pendingRoute);
    },
  };
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

test("locks both native Nautt onboarding actions during one in-flight POST", async ({ page }) => {
  for (const scenario of [
    { action: "/nautt-credentials", buttonName: "Conectar conta", pendingLabel: "Conectando conta", fillKey: true },
    { action: "/nautt-credentials/register", buttonName: "Concluir configuração", pendingLabel: "Concluindo configuração", fillKey: false },
  ]) {
    await page.goto("/design-system", { waitUntil: "domcontentloaded" });
    if (scenario.fillKey) await page.locator("#specimen-pending-api-key").fill("evidence-only-key");
    const observation = await beginPendingNauttSubmission(page, scenario);
    expect(observation.pendingState).toMatchObject({ requestCount: 1, allDisabled: true, busy: "true", spinners: 1, label: scenario.pendingLabel });
    await observation.release();
  }
});

test("creates current, responsive design-system evidence", async ({ page }) => {
  test.setTimeout(120_000);
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

  for (const theme of themes) {
    for (const width of viewports) {
      await page.emulateMedia({ colorScheme: theme.mode, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/design-system", { waitUntil: "domcontentloaded" });
      await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme.id);
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
            ringVisible: styles.boxShadow !== "none",
            visible: rectangle.width > 0 && rectangle.height > 0 && rectangle.bottom > 0 && rectangle.top < window.innerHeight,
            focusVisible: element.matches(":focus-visible"),
          };
        }, index);
        expect(focusState.visible).toBe(true);
        expect(focusState.focusVisible).toBe(true);
        expect(focusState.outlineWidth >= 2 || focusState.ringVisible).toBe(true);
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
        const textareas = selectors('[data-slot="textarea"]');
        return {
          bodyFont: getComputedStyle(document.body).fontFamily,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          hitTargets: hits.map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
          primaryActions: selectors("[data-ds-section]").map((section) => section.querySelectorAll('[data-slot=button][data-variant="default"]').length),
          statusCues: statuses.map((status) => Boolean(status.querySelector("[data-ds-status-cue]"))),
          proseWidths: prose.map((element) => element.getBoundingClientRect().width),
          textareas: textareas.map((element) => ({
            disabled: (element as HTMLTextAreaElement).disabled,
            labelled: Boolean(element.id && document.querySelector(`label[for="${element.id}"]`)),
            invalid: element.getAttribute("aria-invalid") === "true",
            minHeight: element.getBoundingClientRect().height,
          })),
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
      expect(measured.textareas).toHaveLength(3);
      expect(measured.textareas.every(({ labelled, minHeight }) => labelled && minHeight >= 44)).toBe(true);
      expect(measured.textareas.filter(({ disabled }) => disabled)).toHaveLength(1);
      expect(measured.textareas.filter(({ invalid }) => invalid)).toHaveLength(1);
      expect(focusTargetCount).toBeGreaterThan(0);
      expect(severeAxe).toEqual([]);
      expect(externalRequests).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);

      const screenshot = join(runDirectory, `design-system-${theme.id}-${width}.png`);
      await page.locator("#specimen-pending-api-key").fill("evidence-only-key");
      const pendingObservation = await beginPendingNauttSubmission(page, {
        action: "/nautt-credentials",
        buttonName: "Conectar conta",
        pendingLabel: "Conectando conta",
      });
      await pendingObservation.release();
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({ theme: theme.id, mode: theme.mode, width, screenshot: screenshot.slice(process.cwd().length + 1), measured, focusTraversal, pendingState: pendingObservation.pendingState, severeAxe });
    }
  }

  await page.goto("/design-system", { waitUntil: "domcontentloaded" });
  const fallback = await page.evaluate(() => {
    document.documentElement.dataset.theme = "pix-paper";
    const expected = getComputedStyle(document.body).backgroundColor;
    document.documentElement.dataset.theme = "unknown-theme";
    return { expected, actual: getComputedStyle(document.body).backgroundColor };
  });
  expect(fallback.actual).toBe(fallback.expected);

  const resultsPath = join(runDirectory, "assertions.json");
  await writeFile(resultsPath, JSON.stringify(results, null, 2));
  const pngs = await Promise.all(results.map(async ({ screenshot }) => {
    const path = join(process.cwd(), String(screenshot));
    const [contents, metadata] = await Promise.all([readFile(path), stat(path)]);
    return { path: String(screenshot), bytes: metadata.size, sha256: sha256(contents), mtimeMs: metadata.mtimeMs };
  }));
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const assertions = await readFile(resultsPath);
  const manifest = { runId, startedAt, gitHead, themes: themes.map(({ id }) => id), fallback, assertions: resultsPath.slice(process.cwd().length + 1), assertionsSha256: sha256(assertions), pngs };
  const manifestPath = join(runDirectory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({ runId, startedAt, manifest: manifestPath.slice(process.cwd().length + 1) }, null, 2));
  console.log(`DESIGN_SYSTEM_EVIDENCE_RUN=${runId}`);
});
