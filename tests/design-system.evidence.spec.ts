import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

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
const themeVariables = [
  "color-surface-page",
  "color-surface-raised",
  "color-surface-secondary",
  "color-border-default",
  "color-text-primary",
  "color-text-secondary",
  "color-text-tertiary",
  "color-action-accent",
  "color-action-foreground",
  "color-action-soft",
  "color-feedback-success",
  "color-feedback-success-soft",
  "color-feedback-success-foreground",
  "color-feedback-warning",
  "color-feedback-warning-soft",
  "color-feedback-warning-foreground",
  "color-feedback-danger",
  "color-feedback-danger-soft",
  "color-feedback-danger-foreground",
  "color-feedback-info",
  "color-feedback-info-soft",
  "color-feedback-info-foreground",
  "color-focus-ring",
  "shadow-elevation-card",
] as const;
const commonVariables = {
  "radius-tight": "6px",
  "radius-control": "8px",
  "radius-panel": "10px",
  "radius-pill": "999px",
  "focus-width": "3px",
  "focus-offset": "2px",
  "font-interface": "Inter, system-ui, sans-serif",
  "font-display": "Sora, sans-serif",
  "font-numeric": '"IBM Plex Mono", monospace',
  "tracking-display": "-.02em",
} as const;
const artifactRoot = join(process.cwd(), "artifacts", "design-system");
const tokenRoot = join(process.cwd(), "src", "design-system", "tokens");
const applicationOrigin = new URL(process.env.ADMIN_EVIDENCE_BASE_URL ?? "http://127.0.0.1:4319").origin;
let pendingObservationId = 0;

type ThemeId = typeof themes[number]["id"];

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function relativePath(path: string) {
  return relative(process.cwd(), path).split(sep).join("/");
}

async function tokenSourcePaths() {
  const entries = await readdir(tokenRoot, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

async function hashFiles(paths: string[]) {
  return Promise.all(paths.map(async (path) => ({
    path: relativePath(path),
    sha256: sha256(await readFile(path)),
  })));
}

async function sharedUiSourcePaths() {
  const inventoryPath = join(process.cwd(), "src", "components", "ui", "inventory.json");
  const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as {
    currentPrimitiveSources: string[];
    officialAdditions: Array<{ source: string }>;
    owners: Array<{ owner: string }>;
  };
  return [
    inventoryPath,
    join(process.cwd(), "scripts", "check-shared-ui-inventory.mjs"),
    ...inventory.currentPrimitiveSources.map((source) => join(process.cwd(), source)),
    ...inventory.officialAdditions.map(({ source }) => join(process.cwd(), source)),
    ...inventory.owners.map(({ owner }) => join(process.cwd(), owner)),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index).sort();
}

function readExpectedTheme(css: string, theme: ThemeId) {
  const escapedTheme = theme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`:root\\[data-theme="${escapedTheme}"\\] \\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!block) throw new Error(`Generated CSS block is missing for ${theme}.`);
  return Object.fromEntries(themeVariables.map((variable) => {
    const value = block.match(new RegExp(`--${variable}: ([^;]+);`))?.[1];
    if (!value) throw new Error(`Generated CSS does not project --${variable} for ${theme}.`);
    return [variable, value];
  }));
}

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

test("creates current token and typography evidence", async ({ page }) => {
  test.setTimeout(180_000);
  const startedAt = new Date().toISOString();
  const runId = startedAt.replaceAll(/[^\d]/g, "").slice(0, 14);
  const runDirectory = join(artifactRoot, runId);
  const globalsPath = join(process.cwd(), "src", "app", "globals.css");
  const globalsCss = await readFile(globalsPath, "utf8");
  const expectedThemes = Object.fromEntries(themes.map(({ id }) => [id, readExpectedTheme(globalsCss, id)]));
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const results: Array<Record<string, unknown>> = [];

  await mkdir(runDirectory, { recursive: false });
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === applicationOrigin) {
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
      await page.emulateMedia({ colorScheme: theme.mode, reducedMotion: "no-preference" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/design-system", { waitUntil: "domcontentloaded" });
      await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme.id);
      const admittedFonts = await page.evaluate(async () => {
        const sample = "ÁÉÍÓÚ ãõ ç PIX-0716 128,40";
        const admittedFaces = {
          inter: [400, 500, 600].map((weight) => `${weight} 14px Inter`),
          sora: [400, 500, 600, 700].map((weight) => `${weight} 24px Sora`),
          plexMono: [400, 500, 600].map((weight) => `${weight} 14px "IBM Plex Mono"`),
        };
        const groups = await Promise.all(Object.entries(admittedFaces).map(async ([family, descriptors]) => [
          family,
          await Promise.all(descriptors.map((descriptor) => document.fonts.load(descriptor, sample))),
        ] as const));
        await document.fonts.ready;
        return Object.fromEntries(groups.map(([family, loaded]) => [family, loaded.every((faces) => faces.length > 0)]));
      });
      expect(admittedFonts).toEqual({ inter: true, sora: true, plexMono: true });

      const fullMotion = await page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        return {
          duration: styles.getPropertyValue("--motion-duration").trim(),
          iteration: styles.getPropertyValue("--motion-iteration").trim(),
        };
      });
      expect(fullMotion).toEqual({ duration: ".18s", iteration: "1" });

      await page.emulateMedia({ colorScheme: theme.mode, reducedMotion: "reduce" });
      const reducedMotion = await page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);
        const animated = document.querySelector<HTMLElement>('[data-slot="spinner"]');
        return {
          duration: styles.getPropertyValue("--motion-duration").trim(),
          iteration: styles.getPropertyValue("--motion-iteration").trim(),
          animationDuration: animated ? getComputedStyle(animated).animationDuration : null,
          animationIterationCount: animated ? getComputedStyle(animated).animationIterationCount : null,
        };
      });
      expect(reducedMotion).toEqual({ duration: ".01ms", iteration: "1", animationDuration: "1e-05s", animationIterationCount: "1" });

      const focusTargets = page.locator('[data-ds-hit-target]:visible, [data-slot="table-container"][tabindex="0"]:visible');
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
            target: `${element.tagName.toLowerCase()}[data-slot="${element.dataset.slot ?? "none"}"]:${element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "unnamed"}`,
            outlineWidth: Number.parseFloat(styles.outlineWidth),
            outlineColor: styles.outlineColor,
            ringVisible: styles.boxShadow !== "none",
            ringColor: styles.getPropertyValue("--tw-ring-color").trim(),
            visible: rectangle.width > 0 && rectangle.height > 0 && rectangle.bottom > 0 && rectangle.top < window.innerHeight,
            focusVisible: element.matches(":focus-visible"),
          };
        }, index);
        expect(focusState.visible).toBe(true);
        expect(focusState.focusVisible).toBe(true);
        expect(focusState.outlineWidth >= 2 || focusState.ringVisible).toBe(true);
        focusTraversal.push(focusState);
      }

      const measured = await page.evaluate(({ variables, common, expectedThemeTokens, admittedFonts }) => {
        const selectors = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
        const rootStyles = getComputedStyle(document.documentElement);
        const bodyStyles = getComputedStyle(document.body);
        const heading = document.querySelector<HTMLElement>("h1");
        const headingStyles = heading ? getComputedStyle(heading) : null;
        const numericNodes = selectors("table.ds-facts .font-mono");
        const normalizeThemeToken = (variable: string, value: string) => {
          const probe = document.createElement("span");
          probe.style.position = "absolute";
          probe.style.visibility = "hidden";
          if (variable === "shadow-elevation-card") probe.style.boxShadow = value;
          else probe.style.color = value;
          document.body.append(probe);
          const normalized = variable === "shadow-elevation-card" ? getComputedStyle(probe).boxShadow : getComputedStyle(probe).color;
          probe.remove();
          return normalized;
        };
        const luminance = (value: string) => {
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) return 0;
          context.fillStyle = value;
          context.fillRect(0, 0, 1, 1);
          const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
          const linear = channels.map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        };
        const contrast = (foreground: string, background: string) => {
          const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
          return (lighter + 0.05) / (darker + 0.05);
        };
        const composite = (foreground: string, background: string) => {
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas context is required for focus compositing.");
          context.fillStyle = foreground;
          context.fillRect(0, 0, 1, 1);
          const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = background;
          context.fillRect(0, 0, 1, 1);
          const [backgroundRed, backgroundGreen, backgroundBlue] = context.getImageData(0, 0, 1, 1).data;
          const opacity = alpha / 255;
          return `rgb(${Math.round(red * opacity + backgroundRed * (1 - opacity))}, ${Math.round(green * opacity + backgroundGreen * (1 - opacity))}, ${Math.round(blue * opacity + backgroundBlue * (1 - opacity))})`;
        };
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
        const directoryStates = selectors("[data-directory-specimen-state]");
        const visible = (element: HTMLElement) => getComputedStyle(element).display !== "none" && element.getClientRects().length > 0;
        const duplicateIds = Array.from(document.querySelectorAll<HTMLElement>("[id]"))
          .map((element) => element.id)
          .filter((id, index, all) => all.indexOf(id) !== index);
        const readyDirectory = document.querySelector<HTMLElement>('[data-directory-specimen-state="ready"]');
        const wideRenderer = readyDirectory?.querySelector<HTMLElement>(".md\\:block");
        const narrowRenderer = readyDirectory?.querySelector<HTMLElement>(".md\\:hidden");
        const bodyBackground = bodyStyles.backgroundColor;
        const focusRing = normalizeThemeToken("color-focus-ring", rootStyles.getPropertyValue("--ring").trim());
        return {
          themeTokens: Object.fromEntries(variables.map((variable) => [variable, normalizeThemeToken(variable, rootStyles.getPropertyValue(`--${variable}`).trim())])),
          expectedThemeTokens: Object.fromEntries(Object.entries(expectedThemeTokens).map(([variable, value]) => [variable, normalizeThemeToken(variable, value)])),
          commonTokens: Object.fromEntries(common.map((variable) => [variable, rootStyles.getPropertyValue(`--${variable}`).trim()])),
          typography: {
            body: { family: bodyStyles.fontFamily, size: bodyStyles.fontSize, lineHeight: bodyStyles.lineHeight, weight: bodyStyles.fontWeight },
            heading: headingStyles ? { family: headingStyles.fontFamily, size: headingStyles.fontSize, lineHeight: headingStyles.lineHeight, weight: headingStyles.fontWeight, letterSpacing: headingStyles.letterSpacing } : null,
            numeric: numericNodes.map((element) => {
              const styles = getComputedStyle(element);
              return { text: element.textContent?.trim(), family: styles.fontFamily, size: styles.fontSize, lineHeight: styles.lineHeight, weight: styles.fontWeight, variantNumeric: styles.fontVariantNumeric };
            }),
            loaded: admittedFonts,
          },
          semanticContrast: {
            primaryText: contrast(rootStyles.getPropertyValue("--color-text-primary"), bodyBackground),
            tertiaryText: contrast(rootStyles.getPropertyValue("--color-text-tertiary"), bodyBackground),
            action: contrast(rootStyles.getPropertyValue("--color-action-foreground"), rootStyles.getPropertyValue("--color-action-accent")),
          },
          focusContrast: Object.fromEntries(["page", "raised", "secondary"].map((surface) => {
            const background = rootStyles.getPropertyValue(`--color-surface-${surface}`).trim();
            return [surface, contrast(composite(focusRing, background), background)];
          })),
          focusRing,
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
          brand: {
            identities: selectors("[data-brand-identity]").length,
            visibleNames: selectors("[data-brand-identity] .brand-identity__name").length,
            minimumMarkSize: Math.min(...selectors("[data-brand-mark]").map((element) => Math.min(element.getBoundingClientRect().width, element.getBoundingClientRect().height))),
            contrast: contrast(getComputedStyle(selectors("[data-brand-identity]")[0]).color, bodyBackground),
          },
          directory: {
            states: directoryStates.map((element) => element.getAttribute("data-directory-specimen-state")),
            duplicateIds,
            wideVisible: wideRenderer ? visible(wideRenderer) : null,
            narrowVisible: narrowRenderer ? visible(narrowRenderer) : null,
            tableCount: readyDirectory?.querySelectorAll("table").length ?? 0,
            factListCount: readyDirectory?.querySelectorAll("dl").length ?? 0,
            labelledForms: directoryStates.every((state) => {
              const form = state.querySelector("form[method=get]");
              if (!form || form.querySelector("[name=cursor]")) return false;
              return Array.from(form.querySelectorAll("input,select")).every((control) => control.id && form.querySelector(`label[for="${control.id}"]`));
            }),
            paginationLandmark: Boolean(readyDirectory?.querySelector('nav[aria-label] a[href*="cursor="]')),
          },
          maxProseWidth,
        };
      }, { variables: [...themeVariables], common: Object.keys(commonVariables), expectedThemeTokens: expectedThemes[theme.id], admittedFonts });
      const axe = await new AxeBuilder({ page }).analyze();
      const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));

      expect(measured.themeTokens).toEqual(measured.expectedThemeTokens);
      expect(measured.commonTokens).toEqual(commonVariables);
      expect(measured.typography.body).toEqual({ family: "Inter, system-ui, sans-serif", size: "14px", lineHeight: "20px", weight: "400" });
      expect(measured.typography.heading).toEqual({ family: "Sora, sans-serif", size: "24px", lineHeight: "32px", weight: "400", letterSpacing: "-0.48px" });
      expect(measured.typography.numeric).toEqual([
        { text: "PIX-0716", family: '"IBM Plex Mono", monospace', size: "14px", lineHeight: "20px", weight: "400", variantNumeric: "tabular-nums" },
        { text: "128,40", family: '"IBM Plex Mono", monospace', size: "14px", lineHeight: "20px", weight: "400", variantNumeric: "tabular-nums" },
        { text: "PIX-0715", family: '"IBM Plex Mono", monospace', size: "14px", lineHeight: "20px", weight: "400", variantNumeric: "tabular-nums" },
        { text: "72,00", family: '"IBM Plex Mono", monospace', size: "14px", lineHeight: "20px", weight: "400", variantNumeric: "tabular-nums" },
      ]);
      expect(measured.typography.loaded).toEqual({ inter: true, sora: true, plexMono: true });
      expect(measured.semanticContrast.primaryText).toBeGreaterThanOrEqual(4.5);
      expect(measured.semanticContrast.tertiaryText).toBeGreaterThanOrEqual(4.5);
      expect(measured.semanticContrast.action).toBeGreaterThanOrEqual(4.5);
      expect(measured.focusRing).toBe(measured.themeTokens["color-focus-ring"]);
      expect(Object.values(measured.focusContrast).every((ratio) => ratio >= 3)).toBe(true);
      for (const focus of focusTraversal) {
        expect(
          focus.outlineWidth >= 2 ? focus.outlineColor === measured.focusRing : focus.ringColor === measured.focusRing,
          `Focus color mismatch for ${focus.target} at ${theme.id}/${width}`,
        ).toBe(true);
      }
      expect(measured.overflow).toBe(false);
      expect(measured.hitTargets.length).toBeGreaterThan(0);
      expect(measured.hitTargets.every(({ width: targetWidth, height }) => targetWidth >= 44 && height >= 44)).toBe(true);
      expect(measured.primaryActions.every((count) => count <= 1)).toBe(true);
      expect(measured.statusCues.every(Boolean)).toBe(true);
      expect(measured.proseWidths.every((proseWidth) => proseWidth <= measured.maxProseWidth)).toBe(true);
      expect(measured.textareas).toHaveLength(3);
      expect(measured.textareas.every(({ labelled, minHeight }) => labelled && minHeight >= 44)).toBe(true);
      expect(measured.textareas.filter(({ disabled }) => disabled)).toHaveLength(1);
      expect(measured.textareas.filter(({ invalid }) => invalid)).toHaveLength(1);
      expect(measured.brand).toMatchObject({ identities: 4, visibleNames: 3 });
      expect(measured.brand.minimumMarkSize).toBeGreaterThanOrEqual(32);
      expect(measured.brand.contrast).toBeGreaterThanOrEqual(4.5);
      expect(measured.directory.states).toEqual(["ready", "loading", "empty", "filtered-empty", "invalid-query", "error"]);
      expect(measured.directory.duplicateIds).toEqual([]);
      expect(measured.directory.tableCount).toBe(1);
      expect(measured.directory.factListCount).toBe(2);
      expect(measured.directory.labelledForms).toBe(true);
      expect(measured.directory.paginationLandmark).toBe(true);
      expect(measured.directory.wideVisible).toBe(width >= 768);
      expect(measured.directory.narrowVisible).toBe(width < 768);
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
      results.push({
        theme: theme.id,
        mode: theme.mode,
        width,
        screenshot: relativePath(screenshot),
        expectedThemeTokens: measured.expectedThemeTokens,
        measured,
        fullMotion,
        reducedMotion,
        focusTraversal,
        pendingState: pendingObservation.pendingState,
        severeAxe,
      });
    }
  }

  await page.goto("/design-system", { waitUntil: "domcontentloaded" });
  const fallback = await page.evaluate(() => {
    document.documentElement.dataset.theme = "pix-paper";
    const expected = getComputedStyle(document.documentElement).getPropertyValue("--color-surface-page").trim();
    document.documentElement.dataset.theme = "unknown-theme";
    return { expected, actual: getComputedStyle(document.documentElement).getPropertyValue("--color-surface-page").trim() };
  });
  expect(fallback.actual).toBe(fallback.expected);

  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(results, null, 2)}\n`);
  const pngs = await Promise.all(results.map(async ({ screenshot }) => {
    const path = join(process.cwd(), String(screenshot));
    const [contents, metadata] = await Promise.all([readFile(path), stat(path)]);
    return { path: String(screenshot), bytes: metadata.size, sha256: sha256(contents), mtimeMs: metadata.mtimeMs };
  }));
  const tokenFiles = await hashFiles(await tokenSourcePaths());
  const fixedSourcePaths = [
    globalsPath,
    join(process.cwd(), "src", "app", "design-system", "page.tsx"),
    join(process.cwd(), "tests", "design-system.evidence.spec.ts"),
    join(process.cwd(), "scripts", "verify-design-system-evidence.mjs"),
    join(process.cwd(), "scripts", "verify-design-system-evidence.test.ts"),
    join(process.cwd(), "src", "design-system", "fonts", "provenance.json"),
    join(process.cwd(), "src", "brand", "assets.manifest.json"),
    join(process.cwd(), "package.json"),
    join(process.cwd(), "pnpm-lock.yaml"),
  ];
  const sources = [
    ...await hashFiles(fixedSourcePaths),
    ...await hashFiles(await sharedUiSourcePaths()),
    ...tokenFiles,
  ].sort((left, right) => left.path.localeCompare(right.path));
  const assertionBytes = await readFile(assertionsPath);
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const manifest = {
    schemaVersion: 2,
    runId,
    startedAt,
    gitHead,
    matrix: { themes: themes.map(({ id }) => id), viewports: [...viewports], captures: results.length },
    fallback,
    assertions: { path: relativePath(assertionsPath), sha256: sha256(assertionBytes) },
    fontProvenance: sources.find(({ path }) => path === "src/design-system/fonts/provenance.json"),
    brandManifest: sources.find(({ path }) => path === "src/brand/assets.manifest.json"),
    tokenFiles,
    sources,
    pngs,
  };
  const manifestPath = join(runDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestBytes = await readFile(manifestPath);
  const currentPointerPath = join(artifactRoot, "current.json");
  const pendingPointerPath = join(artifactRoot, `.current-${runId}.json.tmp`);
  await writeFile(pendingPointerPath, `${JSON.stringify({
    runId,
    startedAt,
    manifest: relativePath(manifestPath),
    manifestSha256: sha256(manifestBytes),
  }, null, 2)}\n`);
  await rename(pendingPointerPath, currentPointerPath);
  console.log(`DESIGN_SYSTEM_EVIDENCE_RUN=${runId}`);
});
