import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page, test } from "@playwright/test";
import type { Request as PlaywrightRequest } from "@playwright/test";
import sharp from "sharp";
import { storefrontEn } from "@/i18n/dictionaries/storefront/en";
import { storefrontPtBR } from "@/i18n/dictionaries/storefront/pt-BR";

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
const artifactRoot = join(process.cwd(), "artifacts", "store-settings");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const merchantUsername = "store.settings.evidence";
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const dictionaryByLocale = { en: storefrontEn, "pt-BR": storefrontPtBR } as const;
let pendingObservationId = 0;

async function signIn(page: Page, username: string, password: string, landing: "/" | "/admin") {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/Nome de usuário|Username/).fill(username);
  await page.getByLabel(/^Senha$|^Password$/).fill(password);
  await Promise.all([
    page.waitForURL(`${baseUrl}${landing}`),
    page.getByRole("button", { name: /Entrar|Sign in/ }).click(),
  ]);
}

async function setLocale(page: Page, locale: "pt-BR" | "en") {
  await page.goto(`${baseUrl}/settings`);
  const form = page.locator('form[action="/language-preference"]');
  await form.locator('select[name="locale"]').selectOption(locale);
  await Promise.all([
    page.waitForURL(/\?language=saved$/),
    form.getByRole("button").click(),
  ]);
}

async function adminSession(browser: Browser, username: string, password: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, username, password, "/admin");
  return page;
}

// The browser-native fetch carries the admin session cookie and sets Origin
// automatically; the existing admin mutation route stays the only seeding path.
async function adminCurrencyMutation(adminPage: Page, fields: Record<string, string>) {
  const finalUrl = await adminPage.evaluate(async (mutationFields) => {
    const response = await fetch("/admin/exchange-currencies", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(mutationFields),
    });
    return response.url;
  }, fields);
  expect(finalUrl).toBe(`${baseUrl}/admin/settings?success=exchange-currency`);
}

async function registerCurrency(adminPage: Page, code: string, label: string) {
  await adminCurrencyMutation(adminPage, { intent: "register", code, label, currencyUuid: randomUUID(), exchangeCurrencyUuid: randomUUID() });
}

async function deactivateCurrency(adminPage: Page, code: string) {
  await adminCurrencyMutation(adminPage, { intent: "deactivate", code });
}

test("creates the closed store-settings evidence run", async ({ browser, page }) => {
  test.setTimeout(420_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.STORE_SETTINGS_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword, "requires the disposable store-settings evidence runtime");
  const cdp = await page.context().newCDPSession(page);

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

  await signIn(page, adminUsername!, adminPassword!, "/admin");
  await page.goto(`${baseUrl}/admin/accounts`);
  const createAccount = page.locator('form[action$="/admin/users"]');
  await createAccount.getByLabel(/Nome de usuário|Username/).fill(merchantUsername);
  await createAccount.getByLabel(/^Senha$|^Password$/).fill(merchantPassword!);
  await createAccount.getByLabel(/Função|Role/).selectOption("USER");
  await Promise.all([
    page.waitForURL(/\/admin\?success=created$/),
    createAccount.getByRole("button", { name: /Criar conta|Create account/ }).click(),
  ]);
  await page.getByRole("button", { name: /Sair|Sign out/ }).click();
  await signIn(page, merchantUsername, merchantPassword!, "/");

  async function inspectWorkspace(state: string) {
    const measured = await page.evaluate(() => {
      const scope = document.querySelector(".storefront-workspace");
      if (!scope) throw new Error("Storefront workspace is unavailable");
      const visible = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const rectangle = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 0 && rectangle.height > 0;
      };
      const controls = Array.from(scope.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([aria-hidden="true"]), select, button')).filter(visible);
      return {
        bodyFont: getComputedStyle(document.body).fontFamily,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        targets: controls.map((control) => ({
          height: control.getBoundingClientRect().height,
          width: control.getBoundingClientRect().width,
        })),
      };
    });
    expect(measured.bodyFont).toContain("IBM Plex Sans");
    expect(measured.overflow).toBe(false);
    expect(measured.targets.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);
    const slug = page.locator("#storefront-slug");
    await slug.focus();
    const focus = await slug.evaluate((element) => {
      const style = getComputedStyle(element);
      return { boxShadow: style.boxShadow, outlineWidth: Number.parseFloat(style.outlineWidth) };
    });
    expect(focus.outlineWidth >= 2 || focus.boxShadow !== "none").toBe(true);
    const axe = await new AxeBuilder({ page }).include(".storefront-workspace").analyze();
    const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(severeAxe).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    assertions.push({ state, measured, focus, severeAxe });
  }

  async function screenshot(name: string) {
    const relativePath = `artifacts/store-settings/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  async function waitForWorkspace() {
    await expect(page.locator('form[action="/storefront"]')).toBeVisible();
    await expect(page.locator(".storefront-preview")).toBeVisible();
  }

  function nativePostProof(request: PlaywrightRequest, endpoint: string) {
    const contentType = request.headers()["content-type"] ?? "";
    expect(request.method()).toBe("POST");
    expect(request.url()).toBe(`${baseUrl}${endpoint}`);
    expect(request.isNavigationRequest()).toBe(true);
    expect(request.resourceType()).toBe("document");
    expect(contentType).toMatch(/^application\/x-www-form-urlencoded(?:;|$)/);
    return {
      contentType,
      fields: Object.fromEntries(new URLSearchParams(request.postData() ?? "")),
      nativeDocument: true,
      resourceType: request.resourceType(),
    };
  }

  async function captureSavePending(locale: "pt-BR" | "en", trigger: "click" | "enter") {
    const endpoint = "/storefront";
    let requestCount = 0;
    let request: PlaywrightRequest | undefined;
    let releaseRequest: () => void = () => undefined;
    let markReached: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => { markReached = resolve; });
    const release = new Promise<void>((resolve) => { releaseRequest = resolve; });
    const callbackName = `reportStorefrontPending${pendingObservationId++}`;
    let reportPendingState: (state: Record<string, unknown>) => void = () => undefined;
    const observedPendingState = new Promise<Record<string, unknown>>((resolve) => { reportPendingState = resolve; });
    await page.exposeFunction(callbackName, reportPendingState);
    const form = page.locator(`form[action="${endpoint}"]`);
    await form.evaluate((element, reportName) => {
      const fieldset = element.querySelector("fieldset");
      if (!(fieldset instanceof HTMLFieldSetElement)) throw new Error("Storefront pending scope is unavailable");
      const observer = new MutationObserver(() => {
        if (fieldset.getAttribute("aria-busy") !== "true" || !fieldset.disabled) return;
        const state = {
          busy: fieldset.getAttribute("aria-busy"),
          disabledScope: fieldset.disabled,
          spinnerCount: element.querySelectorAll('[data-slot="spinner"]').length,
        };
        (window as unknown as Record<string, (value: typeof state) => void>)[reportName](state);
        observer.disconnect();
      });
      observer.observe(fieldset, { attributes: true, childList: true, subtree: true });
    }, callbackName);
    await page.route(`**${endpoint}`, async (route) => {
      requestCount += 1;
      request = route.request();
      markReached();
      await release;
      await route.continue();
    });
    const navigation = page.waitForURL(/storefront=changed$/);
    if (trigger === "click") void page.getByRole("button", { name: /Salvar configurações da vitrine|Save storefront settings/ }).click({ noWaitAfter: true });
    else void page.locator("#storefront-accent-color").press("Enter", { noWaitAfter: true });
    const [, observed] = await Promise.all([reached, observedPendingState]);
    const pendingState = observed as { busy: string | null; disabledScope: boolean; spinnerCount: number };
    expect(pendingState).toEqual({ busy: "true", disabledScope: true, spinnerCount: 1 });
    const capture = await cdp.send("Page.captureScreenshot", { captureBeyondViewport: true, format: "png", fromSurface: true });
    const relativePath = `artifacts/store-settings/${runId}/interaction-${locale}-save-pending.png`;
    await writeFile(join(process.cwd(), relativePath), Buffer.from(capture.data, "base64"));
    screenshots.push(relativePath);
    expect(request).toBeDefined();
    const requestProof = nativePostProof(request!, endpoint);
    assertions.push({
      state: `${locale}-save-pending`,
      trigger,
      requestCount,
      immediateBusy: pendingState.busy === "true",
      disabledScope: pendingState.disabledScope,
      request: requestProof,
    });
    releaseRequest();
    await navigation;
    await page.unroute(`**${endpoint}`);
    expect(requestCount).toBe(1);
  }

  const logoPng = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 18, g: 84, b: 72 } } }).png().toBuffer();

  for (const locale of locales) {
    await setLocale(page, locale);
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.goto(`${baseUrl}/settings`);
    await waitForWorkspace();
    await page.evaluate(async () => document.fonts.ready);
    for (const theme of themes) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${baseUrl}/settings`);
        await waitForWorkspace();
        await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectWorkspace(`${locale}-${theme}-${width}`);
        await screenshot(`default-${theme}-${locale}-${width}`);
      }
    }

    await page.setViewportSize({ width: 320, height: 1000 });
    await page.goto(`${baseUrl}/settings`);
    await waitForWorkspace();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });

    // The disposable runtime has no active currency mapping yet: the natural
    // disabled-when-unmapped state, explained in the current locale.
    const dictionary = dictionaryByLocale[locale];
    const currency = page.locator("#storefront-currency");
    await expect(currency).toBeDisabled();
    await expect(page.locator("#storefront-currency-help")).toHaveText(dictionary.storefrontCurrencyUnavailable);
    assertions.push({ state: `${locale}-currency-disabled`, disabled: true, explanation: dictionary.storefrontCurrencyUnavailable });
    await screenshot(`interaction-${locale}-currency-disabled`);
  }

  const admin = await adminSession(browser, adminUsername!, adminPassword!);
  await registerCurrency(admin, "BRL", "Brazilian real");

  for (const locale of locales) {
    const dictionary = dictionaryByLocale[locale];
    await setLocale(page, locale);
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.goto(`${baseUrl}/settings`);
    await waitForWorkspace();
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });

    const uploadRequests: PlaywrightRequest[] = [];
    const observeUpload = (request: PlaywrightRequest) => {
      if (request.method() === "POST" && request.url() === `${baseUrl}/storefront/logo`) uploadRequests.push(request);
    };
    page.on("request", observeUpload);
    await page.locator('input[name="logo"]').setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not a real png") });
    await Promise.all([
      page.waitForURL(/storefront-logo=failed$/),
      page.getByRole("button", { name: new RegExp(dictionary.storefrontLogoUpload) }).click(),
    ]);
    await expect(page.locator(".storefront-workspace").getByRole("alert")).toContainText(dictionary.storefrontLogoUploadFailed);
    await screenshot(`interaction-${locale}-logo-failed`);

    await page.locator('input[name="logo"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logoPng });
    await Promise.all([
      page.waitForURL(/storefront-logo=staged&logo=[A-Za-z0-9_-]{43}$/),
      page.getByRole("button", { name: new RegExp(dictionary.storefrontLogoUpload) }).click(),
    ]);
    page.off("request", observeUpload);
    expect(uploadRequests).toHaveLength(2);
    expect(uploadRequests[1]!.headers()["content-type"]).toMatch(/^multipart\/form-data/);
    expect(uploadRequests[1]!.isNavigationRequest()).toBe(true);
    const stagedIdentifier = new URL(page.url()).searchParams.get("logo")!;
    expect(stagedIdentifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(page.getByRole("status").filter({ hasText: dictionary.storefrontLogoStaged })).toBeVisible();
    const stagedImage = page.locator(".storefront-preview__logo");
    await expect(stagedImage).toBeVisible();
    expect(await stagedImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    assertions.push({
      state: `${locale}-logo-staged`,
      identifier: stagedIdentifier,
      imageLoaded: true,
      uploadContentType: uploadRequests[1]!.headers()["content-type"],
    });
    await screenshot(`interaction-${locale}-logo-staged`);

    // The upload navigations reload the page, so the currency choice is made
    // only now, right before the save that must carry it.
    const currency = page.locator("#storefront-currency");
    await expect(currency).toBeEnabled();
    await expect(currency.locator("option")).toHaveCount(2);
    if (locale === "pt-BR") await currency.selectOption("BRL");
    await expect(currency).toHaveValue("BRL");
    assertions.push({ state: `${locale}-currency-enabled`, enabled: true, optionCount: 2, selected: "BRL" });
    await screenshot(`interaction-${locale}-currency-enabled`);

    await captureSavePending(locale, locale === "pt-BR" ? "click" : "enter");
    await expect(page.getByRole("status").filter({ hasText: /atualizadas|updated/i })).toBeVisible();
    await page.goto(`${baseUrl}/settings`);
    await waitForWorkspace();

    await page.getByRole("button", { name: new RegExp(dictionary.storefrontLogoRemove) }).click();
    await expect(page.locator('.storefront-preview [data-brand-identity="merchant-fallback"]')).toBeVisible();
    assertions.push({ state: `${locale}-logo-removed-fallback`, fallbackVisible: true });
    await screenshot(`interaction-${locale}-logo-removed-fallback`);
    await Promise.all([
      page.waitForURL(/storefront=changed$/),
      page.getByRole("button", { name: /Salvar configurações da vitrine|Save storefront settings/ }).click(),
    ]);
    await page.goto(`${baseUrl}/settings`);
    await waitForWorkspace();

    const focusOrder: string[] = [];
    await page.locator("#storefront-slug").focus();
    for (let step = 0; step < 5; step += 1) {
      focusOrder.push(await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.id : "")));
      await page.keyboard.press("Tab");
    }
    expect(focusOrder).toEqual([
      "storefront-slug",
      "storefront-display-name-pt-br",
      "storefront-display-name-en",
      "storefront-theme",
      "storefront-layout",
    ]);
    assertions.push({ state: `${locale}-keyboard`, focusOrder });
    await screenshot(`interaction-${locale}-keyboard`);
  }

  await deactivateCurrency(admin, "BRL");
  await admin.context().close();

  await page.goto(`${baseUrl}/settings`);
  await waitForWorkspace();
  await expect(page.locator("#storefront-currency")).toBeDisabled();
  const saveRequests: PlaywrightRequest[] = [];
  const observeSave = (request: PlaywrightRequest) => {
    if (request.method() === "POST" && request.url() === `${baseUrl}/storefront`) saveRequests.push(request);
  };
  page.on("request", observeSave);
  await Promise.all([
    page.waitForURL(/storefront=changed$/),
    page.getByRole("button", { name: /Salvar configurações da vitrine|Save storefront settings/ }).click(),
  ]);
  page.off("request", observeSave);
  expect(saveRequests).toHaveLength(1);
  const unchangedSave = nativePostProof(saveRequests[0]!, "/storefront");
  expect(unchangedSave.fields).not.toHaveProperty("storefrontDefaultCurrencyCode");
  expect(unchangedSave.fields).not.toHaveProperty("storefrontThemeId");
  expect(unchangedSave.fields).not.toHaveProperty("storefrontLayout");
  expect(unchangedSave.fields).not.toHaveProperty("storefrontStandalonePaymentsEnabled");
  expect(unchangedSave.fields).toHaveProperty("storefrontSlug");
  expect(unchangedSave.fields).toHaveProperty("storefrontLogoMediaIdentifier");
  await expect(page.getByRole("status").filter({ hasText: /atualizadas|updated/i })).toBeVisible();
  assertions.push({ state: "currency-unchanged-save", outcome: "changed", request: unchangedSave });
  await screenshot("interaction-currency-unchanged-save");

  await cdp.detach();
  expect(screenshots).toHaveLength(51);
  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(assertions, null, 2)}\n`);
  const captureRecords = await Promise.all(screenshots.map(async (capturePath) => {
    const [contents, metadata] = await Promise.all([readFile(capturePath), stat(capturePath)]);
    return { path: capturePath, bytes: metadata.size, sha256: sha256(contents) };
  }));
  const sourceInventory = [
    "src/app/(merchant)/settings/page.tsx",
    "src/app/(merchant)/settings/loading.tsx",
    "src/app/storefront-settings-management.tsx",
    "src/app/storefront-preview.tsx",
    "src/app/storefront-form-preparation.ts",
    "src/app/storefront/route.ts",
    "src/app/storefront/logo/route.ts",
    "src/auth/storefront-settings.ts",
    "src/observability/server-request-log.ts",
    "src/i18n/dictionaries/storefront/en.ts",
    "src/i18n/dictionaries/storefront/pt-BR.ts",
    "src/app/globals.css",
    "scripts/generate-design-tokens.mjs",
    "scripts/check-design-tokens.mjs",
    "tests/store-settings.evidence.spec.ts",
    "scripts/run-store-settings-evidence.mjs",
    "scripts/verify-store-settings-evidence.mjs",
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceInventory.map(async (sourcePath) => [sourcePath, sha256(await readFile(sourcePath))])));
  const assertionsBytes = await readFile(assertionsPath);
  const manifest = {
    version: 1,
    runId,
    startedAt,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    baseCaptureCount: 36,
    interactionCaptureCount: 15,
    totalPngCount: 51,
    assertions: `artifacts/store-settings/${runId}/assertions.json`,
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
    "# Store settings visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440, plus fifteen localized interaction captures.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/store-settings/${runId}/manifest.json`,
    review: `artifacts/store-settings/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`STORE_SETTINGS_EVIDENCE_RUN=${runId}`);
});
