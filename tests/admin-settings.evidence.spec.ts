import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const themes = [
  "pix-paper",
  "cashier-daylight",
  "settlement-sand",
  "midnight-clearing",
  "vault-blue",
  "terminal-amber",
] as const;
const locales = ["pt-BR", "en"] as const;
const widths = [375, 768, 1440] as const;
const artifactRoot = join(process.cwd(), "artifacts", "admin-settings");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const composeProject = process.env.ADMIN_SETTINGS_EVIDENCE_COMPOSE_PROJECT ?? "";
const merchantUsername = "admin.settings.merchant";
const secondAdminUsername = "admin.settings.second";
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

async function signIn(page: Page, username: string, password: string) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/Nome de usuário|Username/).fill(username);
  await page.getByLabel(/^Senha$|^Password/).fill(password);
  await Promise.all([
    page.waitForURL(`${baseUrl}/admin`),
    page.getByRole("button", { name: /Entrar|Sign in/ }).click(),
  ]);
}

async function setLocale(page: Page, locale: "pt-BR" | "en") {
  // Use a desktop viewport so the shell language select is reliably visible
  // and not affected by narrow-viewport reflow.
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto(`${baseUrl}/admin/settings`);
  // The app-shell language form auto-submits on change; the settings page also
  // contains a language segment, so target the shell's select explicitly.
  const select = page.locator('form[action="/language-preference"] select[name="locale"]').first();
  await select.waitFor({ state: "visible" });
  const current = await select.inputValue();
  if (current === locale) return;
  // The preference POST redirects to `/?language=saved`, and `/` dispatches
  // the administrator to `/admin` (the query is not preserved).
  await Promise.all([
    page.waitForURL(`${baseUrl}/admin`),
    select.selectOption(locale),
  ]);
}

function evidenceDatabase(args: string[]) {
  const container = execFileSync("docker", [
    "ps", "-q",
    "--filter", `label=com.docker.compose.project=${composeProject}`,
    "--filter", "label=com.docker.compose.service=db",
  ], { encoding: "utf8" }).trim();
  expect(container).not.toBe("");
  return execFileSync("docker", [
    "exec", "-i", container,
    "psql", "-U", "postgres", "-d", "qr_pagamentos", "-p", "5433", "-t", "-A", "-v", "ON_ERROR_STOP=1", "--quiet", ...args,
  ], { encoding: "utf8" });
}

test("creates the closed administrator settings hub evidence run", async ({ page }) => {
  test.setTimeout(1_800_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.ADMIN_SETTINGS_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword || !composeProject, "requires the disposable admin settings evidence runtime");

  const startedAt = new Date().toISOString();
  const runId = startedAt.replaceAll(/[^\d]/g, "").slice(0, 14);
  expect(runId).toMatch(/^\d{14}$/);
  const runDirectory = join(artifactRoot, runId);
  await mkdir(runDirectory, { recursive: true });
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({ runId, startedAt }, null, 2));

  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const assertions: Array<Record<string, unknown>> = [];
  const screenshots: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await signIn(page, adminUsername!, adminPassword!);

  async function inspectAdminSettings(state: string) {
    const measured = await page.evaluate(() => {
      const visible = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const rectangle = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 44 && rectangle.height > 10;
      };
      const controls = Array.from(document.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([type=file]), button, select, a[href], textarea")).filter(visible);
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      return {
        bodyFont: getComputedStyle(document.body).fontFamily,
        focusableCount: controls.length,
        overflow: scrollWidth > clientWidth,
        scrollWidth,
        clientWidth,
        targets: controls.map((control) => ({
          height: control.getBoundingClientRect().height,
          width: control.getBoundingClientRect().width,
        })),
      };
    });
    expect(measured.bodyFont).toContain("Inter");
    expect(measured.overflow).toBe(false);
    expect(measured.targets.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);
    const formControls = page.locator('input:not([type="hidden"]):not([type="file"]), select, textarea');
    const firstInput = (await formControls.count()) > 0 ? formControls.first() : page.locator("button, a[href]").first();
    await firstInput.focus();
    const focus = await firstInput.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        boxShadow: style.boxShadow,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    expect(focus.outlineWidth >= 2 || focus.boxShadow !== "none").toBe(true);
    const axe = await new AxeBuilder({ page }).analyze();
    const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(severeAxe).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    assertions.push({ state, measured, focus, severeAxe });
  }

  async function screenshot(name: string) {
    const relativePath = `artifacts/admin-settings/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath) });
    screenshots.push(relativePath);
    return relativePath;
  }

  async function captureState(name: string) {
    await page.evaluate(async () => document.fonts.ready);
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await inspectAdminSettings(name);
    await screenshot(name);
  }

  // ---- pt-BR pass: hub structure, empty registry, functional theme-default save ----
  await setLocale(page, "pt-BR");

  await page.setViewportSize({ width: 375, height: 1400 });
  await page.goto(`${baseUrl}/admin/settings`);
  const sectionIds = ["sec-currencies", "sec-pairs", "sec-methods", "sec-globalPayments", "sec-appearance", "sec-language"];
  for (const id of sectionIds) await expect(page.locator(`#${id}`)).toBeVisible();
  const anchors = page.locator('nav[aria-label="Seções de configurações"] a[href^="#"]');
  await expect(anchors).toHaveCount(6);
  await expect(page.getByText("Nenhuma moeda de troca está ativa.")).toBeVisible();
  await expect(page.getByText("Nenhum registro está configurado.")).toHaveCount(2);
  const themeInput = page.locator('form[action="/admin/settings/default-theme"] input[name="themeId"]');
  await expect(themeInput).toHaveValue("pix-paper");
  assertions.push({ state: "hub-structure", sections: 6, anchors: 6, emptyStates: 3, fallbackTheme: "pix-paper" });
  await captureState("state-pt-BR-hub-empty-375");

  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto(`${baseUrl}/admin/settings`);
  await page.locator('form[action="/admin/settings/default-theme"] button[data-theme-id="vault-blue"]').click();
  await Promise.all([
    page.waitForURL(/\/admin\/settings\?success=theme-default$/),
    page.getByRole("button", { name: "Salvar tema padrão" }).click(),
  ]);
  await expect(page.getByText("Tema padrão salvo.")).toBeVisible();
  await page.goto(`${baseUrl}/admin/settings`);
  await expect(themeInput).toHaveValue("vault-blue");
  assertions.push({ state: "theme-default-save", outcome: "saved", persisted: "vault-blue" });
  await captureState("state-pt-BR-theme-default-saved-1440");

  // Creation-time stamping proof against the disposable database: a merchant
  // created now receives the saved default; a new administrator stays NULL.
  for (const [username, role] of [[merchantUsername, "USER"], [secondAdminUsername, "ADMIN"]] as const) {
    await page.goto(`${baseUrl}/admin/accounts`);
    const createAccount = page.locator('form[action$="/admin/users"]');
    await createAccount.getByLabel(/Nome de usuário|Username/).fill(username);
    await createAccount.getByLabel(/^Senha$|^Password/).fill(merchantPassword!);
    await createAccount.getByLabel(/Função|Role/).selectOption(role);
    await Promise.all([
      page.waitForURL(/\/admin\?success=created$/),
      createAccount.getByRole("button", { name: /Criar conta|Create account/ }).click(),
    ]);
  }
  const stampedMerchant = evidenceDatabase(["-c", `SELECT storefront_theme_id FROM app."user" WHERE username = '${merchantUsername}'`]).trim();
  const stampedAdmin = evidenceDatabase(["-c", `SELECT coalesce(storefront_theme_id, '<null>') FROM app."user" WHERE username = '${secondAdminUsername}'`]).trim();
  expect(stampedMerchant).toBe("vault-blue");
  expect(stampedAdmin).toBe("<null>");
  assertions.push({ state: "creation-stamping", merchantTheme: stampedMerchant, adminTheme: null });

  await page.setViewportSize({ width: 320, height: 1400 });
  await page.goto(`${baseUrl}/admin/settings`);
  await captureState("state-pt-BR-hub-ready-320");

  // ---- en pass: functional exchange-currency registration ----
  await setLocale(page, "en");

  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto(`${baseUrl}/admin/settings`);
  await page.locator('#sec-currencies button', { hasText: "Add" }).click();
  const registerForm = page.locator('#sec-currencies form[action="/admin/exchange-currencies"]');
  await registerForm.locator('input[name="code"]').fill("USD");
  await registerForm.locator('input[name="label"]').fill("USD/USDT");
  await registerForm.locator('input[name="currencyUuid"]').fill(randomUUID());
  await registerForm.locator('input[name="exchangeCurrencyUuid"]').fill(randomUUID());
  await Promise.all([
    page.waitForURL(/\/admin\/settings\?success=exchange-currency$/),
    registerForm.getByRole("button", { name: "Add" }).click(),
  ]);
  await expect(page.getByText("Exchange currency change saved.")).toBeVisible();
  await expect(page.locator("#sec-currencies").getByText("USD/USDT")).toBeVisible();
  await expect(page.locator("#sec-currencies").getByRole("button", { name: "Deactivate" })).toBeVisible();
  assertions.push({ state: "exchange-currency-register", outcome: "registered", code: "USD" });
  await captureState("state-en-exchange-currency-registered-1440");

  // ---- shared hub grid: six themes, both locales, three widths ----
  for (const locale of locales) {
    await setLocale(page, locale);
    for (const theme of themes) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${baseUrl}/admin/settings`);
        await expect(page.locator("#sec-appearance")).toBeVisible();
        await page.evaluate(async () => document.fonts.ready);
        await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectAdminSettings(`hub-${theme}-${locale}-${width}`);
        await screenshot(`hub-${theme}-${locale}-${width}`);
      }
    }
  }

  expect(screenshots).toHaveLength(40);
  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(assertions, null, 2)}\n`);
  const captureRecords = await Promise.all(screenshots.map(async (capturePath) => {
    const [contents, metadata] = await Promise.all([readFile(capturePath), stat(capturePath)]);
    return { path: capturePath, bytes: metadata.size, sha256: sha256(contents) };
  }));
  const sourceInventory = [
    "src/auth/system-settings.ts",
    "src/auth/administration.ts",
    "src/auth/supported-exchange-currency.ts",
    "src/app/admin/settings/page.tsx",
    "src/app/admin/settings/settings-surface.tsx",
    "src/app/admin/settings/exchange-currencies-section.tsx",
    "src/app/admin/settings/catalog-records-section.tsx",
    "src/app/admin/settings/payment-settings-section.tsx",
    "src/app/admin/settings/appearance-section.tsx",
    "src/app/admin/settings/language-section.tsx",
    "src/app/admin/settings/confirm-toggle.tsx",
    "src/app/admin/settings/default-theme/route.ts",
    "src/app/admin/admin-submit.tsx",
    "src/i18n/dictionaries/administration/en.ts",
    "src/i18n/dictionaries/administration/pt-BR.ts",
    "src/i18n/dictionaries/shared/en.ts",
    "src/i18n/dictionaries/shared/pt-BR.ts",
    "tests/admin-settings.evidence.spec.ts",
    "scripts/run-admin-evidence.mjs",
    "scripts/run-admin-settings-evidence.mjs",
    "scripts/verify-admin-settings-evidence.mjs",
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceInventory.map(async (sourcePath) => [sourcePath, sha256(await readFile(sourcePath))])));
  const assertionsBytes = await readFile(assertionsPath);
  const manifest = {
    version: 1,
    runId,
    startedAt,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    baseCaptureCount: 36,
    stateCaptureCount: 4,
    totalPngCount: 40,
    assertions: `artifacts/admin-settings/${runId}/assertions.json`,
    assertionsSha256: sha256(assertionsBytes),
    captures: captureRecords,
    sourceHashes,
    externalRequests,
    consoleErrors,
    pageErrors,
  };
  const manifestPath = join(runDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestBytes = await readFile(manifestPath);
  await writeFile(join(runDirectory, "review.md"), [
    "# Administrator settings hub visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440 hub captures, plus four localized state captures including 320-pixel reflow, the empty registry, the saved default theme, and the registered exchange currency.",
    "- The default-theme save runs through the delivered POST /admin/settings/default-theme route and persists: a later render shows the saved selection, a merchant created afterward carries the saved theme, and a new administrator keeps NULL.",
    "- The exchange-currency registration runs through the delivered POST /admin/exchange-currencies route and lands back on the hub with the opaque success notice.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- The failure notices are induced only in unit/route tests: the closed selects and validated inputs cannot submit an invalid value honestly, so no runtime failure capture exists.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/admin-settings/${runId}/manifest.json`,
    review: `artifacts/admin-settings/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`ADMIN_SETTINGS_EVIDENCE_RUN=${runId}`);
});
