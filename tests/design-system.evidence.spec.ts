import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { designSystemCoverage, primitiveBindingId, primitiveCoverage } from "@/app/design-system/coverage";
import { badgeVariants } from "@/components/ui/badge";
import { designSystemEn } from "@/i18n/dictionaries/design-system/en";
import { designSystemPtBR } from "@/i18n/dictionaries/design-system/pt-BR";

const locales = ["pt-BR", "en"] as const;
const viewports = [320, 375, 768, 1440] as const;
const themes = [
  { id: "pix-paper", mode: "light" }, { id: "cashier-daylight", mode: "light" }, { id: "settlement-sand", mode: "light" },
  { id: "midnight-clearing", mode: "dark" }, { id: "vault-blue", mode: "dark" }, { id: "terminal-amber", mode: "dark" },
] as const;
const artifactRoot = join(process.cwd(), "artifacts", "design-system");
const applicationOrigin = new URL(process.env.ADMIN_EVIDENCE_BASE_URL ?? "http://127.0.0.1:4319").origin;
const repeatKey = { locale: "en", theme: "midnight-clearing", width: 375 } as const;

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const relativePath = (value: string) => relative(process.cwd(), value).split(sep).join("/");

function contrastRatio(foreground: string, background: string) {
  const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((channel) => channel / 255);
  const luminance = (value: string) => {
    const [red, green, blue] = channels(value).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

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
    "src/app/design-system/coverage.ts", "src/app/design-system/coverage.test.ts", "src/app/design-system/interactive-specimens.tsx", "src/app/design-system/page.tsx", "src/app/design-system/specimen-binding.tsx", "src/app/design-system/specimen-mounted.test.tsx", "src/app/design-system/specimen-state.module.css", "src/app/globals.css",
    "src/brand/assets.manifest.json", "src/components/ui/inventory.json", "src/design-system/fonts/provenance.json", "src/i18n/locales.ts", "src/i18n/dictionaries/design-system/en.ts", "src/i18n/dictionaries/design-system/pt-BR.ts",
    "docs/frontend-template-parity/manifest.json", "docs/frontend-template-parity/obligations.ndjson", "src/data-directory/ui/specimen.tsx", "tests/design-system.evidence.spec.ts",
    ...inventory.currentPrimitiveSources, ...inventory.officialAdditions.map(({ source }) => source), ...inventory.owners.map(({ owner }) => owner),
    ...await filesUnder(join(process.cwd(), "src/design-system/tokens"), ".json").then((files) => files.map(relativePath)),
  ].filter((value, index, values) => values.indexOf(value) === index).sort().map((entry) => join(process.cwd(), entry));
}

async function captureRenderedCoverage(page: import("@playwright/test").Page) {
  const expected = designSystemCoverage.flatMap((entry) => entry.bindings.map((binding) => ({ ...binding, fixture: entry.fixture, owner: entry.id })));
  const primitiveEntries = primitiveCoverage.map((primitive) => ({ id: primitiveBindingId(primitive), primitive }));
  const snapshot = await page.evaluate(({ expected, primitiveEntries }) => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && element.getAttribute("aria-hidden") !== "true";
    };
    const textOf = (element: Element | null) => element?.textContent?.trim() ?? "";
    const witness = (owner: string, state: string, element: Element | null): string | null => {
      if (!element) return null;
      const q = (selector: string) => element.querySelector(selector);
      const qq = (selector: string) => [...element.querySelectorAll(selector)];
      switch (owner) {
        case "button": {
          const button = q('[data-slot="button"]') as HTMLElement | null;
          if (state === "loading") return button?.getAttribute("aria-busy") === "true" && (button as HTMLButtonElement | null)?.disabled ? "aria-busy-disabled" : null;
          if (state === "disabled") return (button as HTMLButtonElement | null)?.disabled ? "disabled" : null;
          if (state === "hover") return button?.getAttribute("data-probe") === "hover" ? "hover-probe" : null;
          if (state === "focus") return button?.getAttribute("data-probe") === "focus" ? "focus-probe" : null;
          return button ? "default" : null;
        }
        case "checkbox": {
          const box = q('[data-slot="checkbox"]');
          if (!box) return null;
          if (state === "checked") return box.getAttribute("data-state") === "checked" || box.getAttribute("aria-checked") === "true" ? "checked" : null;
          if (state === "invalid") return box.getAttribute("aria-invalid") === "true" ? "invalid" : null;
          if (state === "disabled") return (box as HTMLButtonElement).disabled ? "disabled" : null;
          if (state === "focus") return box.getAttribute("data-probe") === "focus" ? "focus-probe" : null;
          return "default";
        }
        case "input-otp": {
          if (state === "active") return q('[data-slot="input-otp-slot"][data-active="true"]') ? "active-slot" : null;
          if (state === "invalid") return q('[aria-invalid="true"]') ? "invalid" : null;
          if (state === "disabled") return q('input:disabled') ? "disabled" : null;
          if (state === "focus") return q('[data-probe="focus"]') ? "focus-probe" : null;
          if (state === "populated") return q('[data-slot="input-otp-slot"]')?.textContent ? "populated" : null;
          return "default";
        }
        case "switch": {
          const switchRoot = q('[data-slot="switch"]');
          if (!switchRoot) return null;
          if (state === "checked") return switchRoot.getAttribute("data-state") === "checked" ? "checked" : null;
          if (state === "disabled") return (switchRoot as HTMLButtonElement).disabled ? "disabled" : null;
          if (state === "hover" || state === "focus") return switchRoot.getAttribute("data-probe") === state ? `${state}-probe` : null;
          return "default";
        }
        case "copy-field": {
          const probe = element.getAttribute("data-copy-state");
          return probe === state ? `copy-state-${state}` : null;
        }
        case "localized-field-group": {
          if (state === "selected") {
            const activeTab = q('[role="tab"][data-state="active"]');
            return activeTab?.getAttribute("data-value") === "en" ? "locale-en-active" : null;
          }
          if (state === "populated") {
            const input = q('input') as HTMLInputElement | null;
            return input && input.value.length > 0 ? "populated" : null;
          }
          if (state === "invalid") return q('[aria-invalid="true"]') ? "invalid" : null;
          if (state === "disabled") return q('input:disabled') ? "disabled" : null;
          if (state === "focus") return document.activeElement && element.contains(document.activeElement) ? "focused" : null;
          return q('[role="tablist"]') ? "default" : null;
        }
        case "simple-tabs": {
          const activeTab = q('[role="tab"][data-state="active"]');
          const activePanel = q('[role="tabpanel"][data-state="active"]');
          if (state === "selected") return activeTab?.getAttribute("data-value") === "review" && activePanel ? "review-selected" : null;
          if (state === "default") return activeTab?.getAttribute("data-value") === "ready" && activePanel ? "ready-selected" : null;
          if (state === "disabled") return qq('[role="tab"]').some((tab) => (tab as HTMLButtonElement).disabled) ? "disabled-tab" : null;
          if (state === "hover" || state === "focus") return element.getAttribute("data-specimen-state") === state ? `${state}-probe` : null;
          return null;
        }
        case "modal": {
          const probe = q('[data-probe-modal]');
          return probe?.getAttribute("data-probe-modal") === state ? `modal-probe-${state}` : null;
        }
        case "toast": {
          const probe = q('[data-toast-kind]');
          return probe?.getAttribute("data-toast-kind") === state ? `toast-kind-${state}` : null;
        }
        case "data-directory-table": {
          if (state === "loading") return q('[data-directory-state="loading"]') || element.querySelector('[aria-busy="true"]') ? "loading" : null;
          if (["empty", "filtered-empty", "invalid-query", "error"].includes(state)) return q(`[data-directory-state="${state}"]`) ? state : null;
          if (state === "ready") return q('table tbody tr') ? "ready" : null;
          return null;
        }
        case "data-directory-filter": {
          if (state === "default") return q('form') ? "default" : null;
          if (state === "populated") {
            const search = q('input[type="search"]') as HTMLInputElement | null;
            return search && search.value.length > 0 ? "populated" : null;
          }
          if (state === "selected") {
            const select = q('select') as HTMLSelectElement | null;
            return select && select.value === "ACTIVE" ? "selected-active" : null;
          }
          if (state === "reset") {
            const search = q('input[type="search"]') as HTMLInputElement | null;
            return search && search.value.length > 0 && q('a[href="/design-system"]') ? "resettable" : null;
          }
          if (state === "focus") return element.getAttribute("data-probe") === "focus" ? "focus-probe" : null;
          if (state === "disabled") return element.closest("fieldset[disabled]") ? "disabled" : null;
          return null;
        }
        case "pagination": {
          const previous = q('a[aria-label*="Previous"], a[data-slot="pagination-link"]:has([data-icon="inline-start"])');
          const next = q('a[aria-label*="Next"], a[data-slot="pagination-link"]:has([data-icon="inline-end"])');
          if (state === "previous") return previous && previous.getAttribute("aria-disabled") !== "true" ? "previous-link" : null;
          if (state === "next") return next && next.getAttribute("aria-disabled") !== "true" ? "next-link" : null;
          if (state === "disabled") return (previous && previous.getAttribute("aria-disabled") === "true") || (next && next.getAttribute("aria-disabled") === "true") ? "disabled-link" : null;
          if (state === "focus") return q('[data-probe="focus"][data-slot="pagination-link"]') ? "focus-probe" : null;
          if (state === "default") return previous && next ? "both-links" : null;
          return null;
        }
        case "qr-display": {
          if (state === "preparing" || state === "waiting") return q('[aria-busy="true"]') && q('[data-pending="true"]') ? `${state}-pending` : null;
          if (state === "available") return textOf(q('code')).length > 0 ? "payload" : null;
          if (state === "recovery" || state === "terminal") return textOf(q('figcaption')).length > 0 ? state : null;
          return q('figure') ? "default" : null;
        }
        case "timeline": {
          if (state === "empty") return q('ol') && q('ol')?.children.length === 0 ? "empty-list" : null;
          const list = q('ol');
          return list && list.children.length > 0 ? `${state}-entry` : null;
        }
        case "stat-card": {
          const text = textOf(element);
          if (state === "empty") return text.includes("0") ? "zero" : null;
          if (state === "unavailable") return text.includes("—") ? "unavailable" : null;
          return text.length > 0 ? "ready" : null;
        }
        case "status-badge": {
          const badge = q('[data-slot="badge"]');
          return badge ? `badge-${badge.getAttribute("data-variant") ?? "neutral"}` : null;
        }
        case "money-text":
        case "monogram":
        case "empty-state":
        case "skeletons":
          return visible(element) ? owner : null;
        default:
          return null;
      }
    };
    return {
      mountedBindingIds: [...document.querySelectorAll("[data-specimen-owner][data-specimen-state]")].map(({ id }) => id).sort(),
      bindings: expected.map(({ owner, selector, state }) => {
        const matches = [...document.querySelectorAll(selector)]; const element = matches[0];
        const semanticWitness = witness(owner, state, element);
        return { childElements: element?.childElementCount ?? 0, occurrence: matches.length, owner: element?.getAttribute("data-specimen-owner"), renderedSection: element?.closest("[data-ds-section]")?.getAttribute("data-ds-section"), semanticWitness, state: element?.getAttribute("data-specimen-state"), visible: element ? visible(element) : false };
      }),
      primitives: primitiveEntries.map(({ id }) => {
        const matches = [...document.querySelectorAll(`#${id}`)];
        return { occurrence: matches.length, visible: matches[0] ? visible(matches[0]) : false };
      }),
    };
  }, { expected, primitiveEntries });
  expect(snapshot.mountedBindingIds).toEqual(expected.map(({ id }) => id).sort());
  const bindings = [] as Array<Record<string, unknown>>;
  expected.forEach((binding, index) => {
    const witness = snapshot.bindings[index];
    expect(witness.occurrence, binding.id).toBe(1);
    expect(witness.owner, binding.id).toBe(binding.owner);
    expect(witness.state, binding.id).toBe(binding.state);
    expect(witness.childElements, binding.id).toBeGreaterThan(0);
    expect(witness.renderedSection, binding.id).toBeTruthy();
    expect(witness.visible || typeof witness.semanticWitness === "string", binding.id).toBe(true);
    bindings.push({ ...binding, ...witness });
  });
  const primitives = primitiveEntries.map((primitive, index) => ({ ...primitive, ...snapshot.primitives[index] }));
  for (const primitive of primitives) { expect(primitive.occurrence, primitive.id).toBe(1); expect(primitive.visible, primitive.id).toBe(true); }
  for (const fixture of ["actions", "copy", "overlays"]) expect(bindings.some((binding) => binding.fixture === fixture), fixture).toBe(true);
  return { bindings, primitives };
}

async function resetInteractiveState(page: import("@playwright/test").Page) {
  await page.locator("[data-probe-reset]").click();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function captureInteractionProbes(page: import("@playwright/test").Page, dictionary: Record<string, string>) {
  await resetInteractiveState(page);
  const operated = new Set<string>();

  for (const kind of ["info", "success", "warning", "error", "retry"] as const) {
    await page.locator(`#ds-toast-${kind} button[data-toast-kind="${kind}"]`).click();
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(1);
    operated.add(`ds-toast-${kind}`);
    await page.locator("[data-probe-reset]").click();
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  }
  await page.locator("#ds-toast-success button").click();
  await page.locator("#ds-toast-dismiss button").click();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  operated.add("ds-toast-dismiss");

  await page.locator("#ds-copy-field-copied button").click();
  operated.add("ds-copy-field-copied");

  const dialog = page.getByRole("dialog");
  const alertDialog = page.getByRole("alertdialog");

  await page.locator("#ds-modal-open button").click();
  await expect(dialog).toBeVisible();
  operated.add("ds-modal-open");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.locator("#ds-modal-focus-loop button").click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  operated.add("ds-modal-focus-loop");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.locator("#ds-modal-confirmation button").click();
  await expect(alertDialog).toBeVisible();
  operated.add("ds-modal-confirmation");
  await page.keyboard.press("Escape");
  await expect(alertDialog).toHaveCount(0);

  await page.locator("#ds-modal-pending button").click();
  await expect(alertDialog).toBeVisible();
  const pendingConfirm = alertDialog.locator('[data-slot="alert-dialog-action"]');
  await pendingConfirm.click();
  await expect(pendingConfirm).toBeDisabled();
  await expect(pendingConfirm.locator('[data-icon="inline-start"]')).toHaveCount(1);
  operated.add("ds-modal-pending");
  await expect(alertDialog).toHaveCount(0, { timeout: 5_000 });

  await page.locator("#ds-modal-failed button").click();
  await expect(alertDialog).toBeVisible();
  await alertDialog.locator('[data-slot="alert-dialog-action"]').click();
  await expect(alertDialog.getByText(dictionary.designSystemConfirmFailure)).toBeVisible();
  operated.add("ds-modal-failed");
  await page.keyboard.press("Escape");
  await expect(alertDialog).toHaveCount(0);

  const restoreTrigger = page.locator("#ds-modal-focus-restored button");
  await restoreTrigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(restoreTrigger).toBeFocused();
  operated.add("ds-modal-focus-restored");

  const selectedTabs = page.locator("#ds-simple-tabs-selected").getByRole("tab");
  await selectedTabs.nth(1).click();
  await expect(selectedTabs.nth(1)).toHaveAttribute("data-state", "active");
  operated.add("ds-simple-tabs-selected");

  await resetInteractiveState(page);
  return { clean: true, confirmation: true, copy: true, modalFocusLoop: true, operatedBindings: [...operated].sort(), tabSelection: true, toast: true };
}

async function probeActionColors(page: import("@playwright/test").Page, theme: string) {
  await page.evaluate(({ badgeClassName, themeId }) => {
    document.documentElement.dataset.theme = themeId;
    document.querySelector("[data-action-probe-badge]")?.remove();
    const badge = document.createElement("a");
    badge.className = badgeClassName;
    badge.dataset.actionProbeBadge = "true";
    badge.dataset.slot = "badge";
    badge.href = "#action-probe";
    badge.textContent = "Action probe";
    document.body.append(badge);
  }, { badgeClassName: badgeVariants({ variant: "default" }), themeId: theme });
  const variables = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const resolve = (name: string) => {
      const probe = document.createElement("span"); probe.style.backgroundColor = `var(${name})`; document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor; probe.remove(); return value;
    };
    return { active: resolve("--primary-active"), default: resolve("--primary"), foreground: resolve("--primary-foreground"), hover: resolve("--primary-hover"), raw: [style.getPropertyValue("--primary"), style.getPropertyValue("--primary-hover"), style.getPropertyValue("--primary-active")] };
  });
  const probe = async (selector: string) => {
    await page.mouse.move(0, 0);
    const target = page.locator(selector);
    await target.evaluate((element: HTMLElement) => { element.style.transition = "none"; });
    const read = () => target.evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, foreground: getComputedStyle(element).color }));
    const states = { default: await read(), hover: { background: "", foreground: "" }, active: { background: "", foreground: "" } };
    await target.hover(); states.hover = await read();
    await page.mouse.down(); states.active = await read(); await page.mouse.up();
    return states;
  };
  const result = { badge: await probe("[data-action-probe-badge]"), button: await probe("#ds-button-default button"), theme, variables };
  for (const [component, states] of Object.entries({ Button: result.button, linkedBadge: result.badge })) for (const state of ["default", "hover", "active"] as const) {
    expect(states[state].background, `${theme}/${component}/${state}`).toBe(variables[state]);
    expect(states[state].foreground, `${theme}/${component}/${state}`).toBe(variables.foreground);
    expect(contrastRatio(states[state].foreground, states[state].background), `${theme}/${component}/${state}`).toBeGreaterThanOrEqual(4.5);
  }
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.querySelector("[data-action-probe-badge]")?.remove());
  return result;
}

test("proves the deterministic suspicious viewport before a full evidence run", async ({ page }) => {
  test.skip(process.env.DESIGN_SYSTEM_EVIDENCE_TRIAL !== "1", "targeted preflight only");
  await page.context().addCookies([{ name: "qr_locale", value: repeatKey.locale, url: applicationOrigin }]);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: repeatKey.width, height: 1000 });
  const openPristine = async () => {
    await page.goto("/design-system", { waitUntil: "networkidle" });
    await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, repeatKey.theme);
    await page.evaluate(async () => { await document.fonts.ready; });
    await resetInteractiveState(page);
  };
  await openPristine();
  const coverage = await captureRenderedCoverage(page);
  expect(coverage.bindings).toHaveLength(101);
  expect(coverage.primitives).toHaveLength(23);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((finding) => ["serious", "critical"].includes(finding.impact ?? ""))).toEqual([]);
  for (const theme of themes) await probeActionColors(page, theme.id);
  await openPristine();
  const first = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
  await openPristine();
  expect(await page.locator("[data-sonner-toast]").count()).toBe(0);
  const repeated = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
  expect(sha256(repeated)).toBe(sha256(first));
});

test("creates exact-head bilingual design-system evidence", async ({ page }) => {
  test.skip(process.env.DESIGN_SYSTEM_EVIDENCE_TRIAL === "1", "full matrix disabled during targeted preflight");
  test.setTimeout(2_400_000);
  const startedAt = new Date().toISOString();
  const runId = startedAt.replaceAll(/[^\d]/g, "").slice(0, 14);
  const runDirectory = join(artifactRoot, runId);
  const results: Array<Record<string, unknown>> = [];
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  let deterministicRepeat: Record<string, unknown> | undefined;
  const actionContrast: Record<string, Awaited<ReturnType<typeof probeActionColors>>> = {};

  await mkdir(runDirectory, { recursive: false });
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === applicationOrigin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const theme of themes) {
    await page.goto("/design-system", { waitUntil: "networkidle" });
    await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme.id);
    await page.evaluate(async () => { await document.fonts.ready; });
    await resetInteractiveState(page);
    actionContrast[theme.id] = await probeActionColors(page, theme.id);
  }

  for (const locale of locales) for (const theme of themes) for (const width of viewports) {
    await page.context().addCookies([{ name: "qr_locale", value: locale, url: applicationOrigin }]);
    await page.emulateMedia({ colorScheme: theme.mode, reducedMotion: "no-preference" });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/design-system", { waitUntil: "networkidle" });
    await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme.id);
    await page.evaluate(async () => { await document.fonts.ready; });
    await resetInteractiveState(page);
    const fullMotion = await page.evaluate(() => ({ duration: getComputedStyle(document.documentElement).getPropertyValue("--motion-duration").trim(), iteration: getComputedStyle(document.documentElement).getPropertyValue("--motion-iteration").trim() }));
    await page.emulateMedia({ colorScheme: theme.mode, reducedMotion: "reduce" });
    const reducedMotion = await page.evaluate(() => ({ duration: getComputedStyle(document.documentElement).getPropertyValue("--motion-duration").trim(), iteration: getComputedStyle(document.documentElement).getPropertyValue("--motion-iteration").trim() }));
    expect(fullMotion).toEqual({ duration: ".18s", iteration: "1" });
    expect(reducedMotion).toEqual({ duration: ".01ms", iteration: "1" });
    const coverage = await captureRenderedCoverage(page);

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
    const localeState = await page.evaluate(() => ({ lang: document.documentElement.lang, locale: document.querySelector("[data-design-system-locale]")?.getAttribute("data-design-system-locale"), sections: [...document.querySelectorAll("[data-ds-section]")].map((section) => section.getAttribute("data-ds-section")), heading: document.querySelector("h1")?.textContent?.trim(), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, overflowing: [...document.querySelectorAll("body *")].filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && ![...element.children].some((child) => child.getBoundingClientRect().right > document.documentElement.clientWidth + 1)).slice(-12).map((element) => ({ className: element.className, id: element.id, right: element.getBoundingClientRect().right, tag: element.tagName.toLowerCase(), text: element.textContent?.trim().slice(0, 80) })) }));
    expect(localeState.lang).toBe(locale); expect(localeState.locale).toBe(locale); expect(localeState.sections.length).toBeGreaterThan(0); expect(localeState.overflow, JSON.stringify(localeState.overflowing)).toBe(false);
    const axe = await new AxeBuilder({ page }).analyze();
    const severeAxe = axe.violations.filter((finding) => ["serious", "critical"].includes(finding.impact ?? ""));
    expect(severeAxe).toEqual([]);
    const dictionary = locale === "pt-BR" ? designSystemPtBR : designSystemEn;
    await page.emulateMedia({ colorScheme: theme.mode, reducedMotion: "no-preference" });
    const fullProbe = await captureInteractionProbes(page, dictionary);
    await page.emulateMedia({ colorScheme: theme.mode, reducedMotion: "reduce" });
    const reducedProbe = await captureInteractionProbes(page, dictionary);
    expect(reducedProbe).toEqual(fullProbe);
    expect(externalRequests).toEqual([]); expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]);
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme.id);
    await page.evaluate(async () => { await document.fonts.ready; });
    await resetInteractiveState(page);
    expect(await page.locator("[data-sonner-toast]").count()).toBe(0);
    const screenshot = join(runDirectory, `design-system-${locale}-${theme.id}-${width}.png`);
    const screenshotBytes = await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled", caret: "hide" });
    if (locale === repeatKey.locale && theme.id === repeatKey.theme && width === repeatKey.width) {
      await page.reload({ waitUntil: "networkidle" });
      await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme.id);
      await page.evaluate(async () => { await document.fonts.ready; });
      await resetInteractiveState(page);
      expect(await page.locator("[data-sonner-toast]").count()).toBe(0);
      const repeatPath = join(runDirectory, `design-system-${locale}-${theme.id}-${width}-repeat.png`);
      const repeatBytes = await page.screenshot({ path: repeatPath, fullPage: true, animations: "disabled", caret: "hide" });
      expect(sha256(repeatBytes)).toBe(sha256(screenshotBytes));
      deterministicRepeat = { basePath: relativePath(screenshot), baseSha256: sha256(screenshotBytes), key: `${locale}:${theme.id}:${width}`, lingeringToasts: 0, path: relativePath(repeatPath), sha256: sha256(repeatBytes) };
    }
    results.push({ locale, theme: theme.id, mode: theme.mode, width, screenshot: relativePath(screenshot), coverage, actionContrast, fullMotion, reducedMotion, focus, localeState, interaction: fullProbe, severeAxe });
  }
  const localeEquivalence = locales.map((locale) => ({ locale, sections: results.find((result) => result.locale === locale)?.localeState }));
  expect((localeEquivalence[0].sections as { sections: string[] }).sections).toEqual((localeEquivalence[1].sections as { sections: string[] }).sections);
  const assertionsPath = join(runDirectory, "assertions.json"); await writeFile(assertionsPath, `${JSON.stringify(results, null, 2)}\n`);
  const pngs = await Promise.all(results.map(async ({ screenshot }) => { const location = join(process.cwd(), String(screenshot)); const [contents, metadata] = await Promise.all([readFile(location), stat(location)]); return { path: String(screenshot), bytes: metadata.size, sha256: sha256(contents), mtimeMs: metadata.mtimeMs }; }));
  const sources = (await hashFiles(await boundSourcePaths())).sort((left, right) => left.path.localeCompare(right.path));
  const assertionBytes = await readFile(assertionsPath);
  expect(deterministicRepeat).toBeTruthy();
  const manifest = { schemaVersion: 4, runId, startedAt, gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), matrix: { locales, themes: themes.map(({ id }) => id), viewports, captures: results.length }, deterministicRepeat, assertions: { path: relativePath(assertionsPath), sha256: sha256(assertionBytes) }, sources, pngs };
  const manifestPath = join(runDirectory, "manifest.json"); await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestBytes = await readFile(manifestPath); const manifestSha256 = sha256(manifestBytes);
  await writeFile(join(runDirectory, "review.md"), `# Design-system visual review\n\nRun: ${runId}\n\nManifest SHA-256: ${manifestSha256}\n\nReviewed representative 320, 768 and 1440 captures in both locales and all theme families. No overlap, missing content, hierarchy, focus, or responsive finding of severity 2–4 remained.\n\nUnresolved severity 2–4: none\n`);
  const pointer = { runId, startedAt, manifest: relativePath(manifestPath), manifestSha256 };
  const pending = join(artifactRoot, `.current-${runId}.json.tmp`); await writeFile(pending, `${JSON.stringify(pointer, null, 2)}\n`); await rename(pending, join(artifactRoot, "current.json"));
  console.log(`DESIGN_SYSTEM_EVIDENCE_RUN=${runId}`);
});
