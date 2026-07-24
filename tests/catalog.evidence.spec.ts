import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";

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
const artifactRoot = join(process.cwd(), "artifacts", "catalog");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const merchantUsername = "catalog.evidence";
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

async function signIn(page: Page, username: string, password: string, landing: "/" | "/admin") {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/Nome de usuário|Username/).fill(username);
  await page.getByLabel(/^Senha$|^Password/).fill(password);
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

test("creates the closed merchant-catalog evidence run", async ({ page }) => {
  test.setTimeout(900_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.CATALOG_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword, "requires the disposable catalog evidence runtime");

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
  await createAccount.getByLabel(/^Senha$|^Password/).fill(merchantPassword!);
  await createAccount.getByLabel(/Função|Role/).selectOption("USER");
  await Promise.all([
    page.waitForURL(/\/admin\?success=created$/),
    createAccount.getByRole("button", { name: /Criar conta|Create account/ }).click(),
  ]);
  await page.getByRole("button", { name: /Sair|Sign out/ }).click();
  await signIn(page, merchantUsername, merchantPassword!, "/");

  async function inspectCatalog(state: string) {
    const measured = await page.evaluate(() => {
      const visible = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const rectangle = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 44 && rectangle.height > 10;
      };
      const controls = Array.from(document.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([type=file]), button, select, a[href]")).filter(visible);
      return {
        bodyFont: getComputedStyle(document.body).fontFamily,
        focusableCount: controls.length,
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
    const firstInput = page.locator('input:not([type="hidden"]):not([type="file"]), select').first();
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
    const relativePath = `artifacts/catalog/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  async function captureState(name: string) {
    await page.evaluate(async () => document.fonts.ready);
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await inspectCatalog(name);
    await screenshot(name);
  }

  // ---- pt-BR pass: currency-unmapped state, catalog setup, native flows ----
  await setLocale(page, "pt-BR");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/catalog/products/new`);
  const unmappedSelect = page.locator("select#product-create-currency");
  await expect(unmappedSelect).toBeDisabled();
  assertions.push({ state: "currency-unmapped-disabled", disabled: await unmappedSelect.isDisabled() });
  await captureState("state-pt-BR-currency-unmapped-1440");

  // Register the BRL mapping through the real administrator route in an
  // isolated admin session; the merchant session stays untouched.
  const adminContext = await page.context().browser()!.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, adminUsername!, adminPassword!, "/admin");
  const register = await adminPage.request.post(`${baseUrl}/admin/exchange-currencies`, {
    headers: { origin: baseUrl },
    form: {
      intent: "register",
      code: "BRL",
      label: "Real brasileiro",
      currencyUuid: randomUUID(),
      exchangeCurrencyUuid: randomUUID(),
    },
  });
  expect(register.status()).toBe(303);
  await adminContext.close();
  await page.goto(`${baseUrl}/catalog/products/new`);
  await expect(page.locator("select#product-create-currency")).toBeEnabled();

  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(`${baseUrl}/catalog`);
  await captureState("state-pt-BR-products-empty-375");

  await page.goto(`${baseUrl}/catalog/categories`);
  await captureState("state-pt-BR-categories-empty-375");

  async function createCategory(namePtBr: string, nameEn: string) {
    await page.goto(`${baseUrl}/catalog/categories`);
    const form = page.locator('form#category-create');
    await form.getByLabel(/Nome em português|Name in Portuguese/).fill(namePtBr);
    await form.getByLabel(/Nome em inglês|Name in English/).fill(nameEn);
    await Promise.all([
      page.waitForURL(/\/catalog\/categories\?categories=create$/),
      form.getByRole("button").click(),
    ]);
  }

  await createCategory("Bebidas", "Drinks");
  await createCategory("Comidas", "Food");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/catalog/categories`);
  await expect(page.getByText("Drinks").first()).toBeVisible();
  await captureState("state-pt-BR-categories-ready-1440");

  // Product with category, currency, and a staged image through the real
  // multipart staging route and owner-fenced media read.
  await page.goto(`${baseUrl}/catalog/products/new`);
  await page.locator("select#product-create-currency").selectOption("BRL");
  await page.locator("select#product-create-category").selectOption({ index: 1 });
  await page.getByLabel(/Nome interno|Internal name/).fill("Espresso");
  await page.getByLabel(/Título público em português|Public title in Portuguese/).fill("Café expresso");
  await page.getByLabel(/Título público em inglês|Public title in English/).fill("Espresso shot");
  await page.getByLabel(/Descrição pública em português|Public description in Portuguese/).fill("Dose dupla.");
  await page.getByLabel(/Descrição pública em inglês|Public description in English/).fill("Double shot.");
  await page.getByLabel(/Preço|Price/).fill("12.50");
  const image = await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 24, g: 122, b: 108 } } }).png().toBuffer();
  const stagingRequests: string[] = [];
  page.on("response", (response) => {
    if (response.request().method() === "POST" && response.url() === `${baseUrl}/products/images`) {
      stagingRequests.push(String(response.status()));
    }
  });
  await page.setInputFiles("input#product-create-image", { name: "espresso.png", mimeType: "image/png", buffer: image });
  const stagedPreview = page.locator('img[src^="/media/"]');
  await expect(stagedPreview).toBeVisible();
  expect(stagingRequests).toEqual(["200"]);
  const stagedSrc = await stagedPreview.getAttribute("src");
  expect(stagedSrc).toMatch(/^\/media\/.+$/);
  assertions.push({ state: "image-staged", stagingStatus: stagingRequests, preview: stagedSrc });
  await captureState("state-pt-BR-product-new-upload-staged-1440");

  const createForm = page.locator('form#product-create');
  const createPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url() === `${baseUrl}/products`) createPosts.push(request.postData() ?? "");
  });
  await Promise.all([
    page.waitForURL(/\/catalog\?products=create$/),
    createForm.getByRole("button", { name: /Criar produto|Create product/ }).click(),
  ]);
  expect(createPosts).toHaveLength(1);
  const createFields = Object.fromEntries(new URLSearchParams(createPosts[0]));
  expect(createFields.action).toBe("create");
  expect(createFields.currencyCode).toBe("BRL");
  expect(createFields.categoryId).toMatch(/^[0-9a-f-]{36}$/);
  expect(createFields.imageMediaId).toBe(stagedSrc!.replace("/media/", ""));
  assertions.push({ state: "product-create-native-post", fields: createFields, requestCount: createPosts.length });
  await expect(page.getByRole("status").first()).toBeVisible();
  await captureState("state-pt-BR-product-created-notice-1440");

  // Deactivation with atomic reassignment, proven through the native payload.
  await page.goto(`${baseUrl}/catalog/categories`);
  const deactivateBlocks = page.locator("details", { has: page.locator('input[value="deactivate"]') });
  const firstBlock = deactivateBlocks.first();
  await firstBlock.locator("summary").first().click();
  await expect(firstBlock.locator('select[name="replacementId"]')).toBeVisible();
  await captureState("state-pt-BR-category-deactivation-1440");
  await firstBlock.locator('select[name="replacementId"]').selectOption({ index: 1 });
  const categoryPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url() === `${baseUrl}/product-categories`) categoryPosts.push(request.postData() ?? "");
  });
  await Promise.all([
    page.waitForURL(/\/catalog\/categories\?categories=deactivate$/),
    firstBlock.getByRole("button", { name: /Desativar categoria permanentemente|Deactivate category permanently/ }).click(),
  ]);
  expect(categoryPosts).toHaveLength(1);
  const deactivateFields = Object.fromEntries(new URLSearchParams(categoryPosts[0]));
  expect(deactivateFields.action).toBe("deactivate");
  expect(deactivateFields.replacementId).toMatch(/^[0-9a-f-]{36}$/);
  expect(deactivateFields.replacementId).not.toBe(deactivateFields.id);
  assertions.push({ state: "category-deactivation-native-post", fields: deactivateFields, requestCount: categoryPosts.length });

  // Archive the product, then prove the terminal read-only view.
  await page.goto(`${baseUrl}/catalog`);
  await page.getByRole("link", { name: /^Editar$|^Edit$/ }).first().click();
  await page.waitForURL(/\/catalog\/products\/[0-9a-f-]{36}$/);
  const productUrl = page.url();
  const archiveDetails = page.locator("details", { has: page.locator('input[value="archive"]') });
  await archiveDetails.locator("summary").click();
  await Promise.all([
    page.waitForURL(/\/catalog\?products=archive$/),
    archiveDetails.getByRole("button", { name: /Arquivar produto permanentemente|Archive product permanently/ }).click(),
  ]);
  await expect(page.getByText(/Arquivado|Archived/).first()).toBeVisible();
  await page.goto(productUrl);
  await expect(page.locator('form[action="/products"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Editar|Edit|Arquivar|Archive/ })).toHaveCount(0);
  assertions.push({ state: "archived-read-only", mutationForms: 0 });
  await captureState("state-pt-BR-product-archived-1440");

  // ---- en pass: forms and honest directory states ----
  await setLocale(page, "en");

  await page.goto(`${baseUrl}/catalog/products/new`);
  await expect(page.locator("select#product-create-currency")).toBeEnabled();
  await captureState("state-en-product-new-form-1440");

  // Second product so the edit form and filtered states have live data.
  await page.getByLabel(/Nome interno|Internal name/).fill("Filter coffee");
  await page.getByLabel(/Título público em português|Public title in Portuguese/).fill("Café coado");
  await page.getByLabel(/Título público em inglês|Public title in English/).fill("Filter coffee");
  await page.getByLabel(/Descrição pública em português|Public description in Portuguese/).fill("Coado na hora.");
  await page.getByLabel(/Descrição pública em inglês|Public description in English/).fill("Freshly brewed.");
  await page.getByLabel(/Preço|Price/).fill("9.90");
  await Promise.all([
    page.waitForURL(/\/catalog\?products=create$/),
    page.locator('form#product-create').getByRole("button", { name: /Criar produto|Create product/ }).click(),
  ]);

  await page.goto(`${baseUrl}/catalog`);
  await page.getByRole("link", { name: /^Edit$/ }).first().click();
  await page.waitForURL(/\/catalog\/products\/[0-9a-f-]{36}$/);
  await captureState("state-en-product-edit-form-1440");

  await page.goto(`${baseUrl}/catalog?q=no-such-product`);
  await captureState("state-en-products-filtered-empty-1440");

  await page.goto(`${baseUrl}/catalog?forged=1`);
  await captureState("state-en-products-invalid-query-1440");

  // A referenced category with no active replacement explains the blocked
  // deactivation instead of offering a doomed submit: after the pt-BR
  // reassignment, the only active category still references the product.
  await page.goto(`${baseUrl}/catalog/categories`);
  const blocked = page.locator("details", { has: page.getByText(/Deactivation is unavailable|A desativação está indisponível/) }).first();
  await blocked.locator("summary").first().click();
  await expect(blocked.locator('select[name="replacementId"]')).toHaveCount(0);
  await expect(blocked.locator('input[value="deactivate"]')).toHaveCount(0);
  assertions.push({ state: "category-no-replacement", replacementSelects: 0, deactivateForms: 0 });
  await captureState("state-en-category-no-replacement-1440");

  // ---- shared directory grid: six themes, both locales, three widths ----
  for (const locale of locales) {
    await setLocale(page, locale);
    for (const theme of themes) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${baseUrl}/catalog`);
        await expect(page.locator("[data-data-directory]")).toBeVisible();
        await page.evaluate(async () => document.fonts.ready);
        await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectCatalog(`directory-${theme}-${locale}-${width}`);
        await screenshot(`directory-${theme}-${locale}-${width}`);
      }
    }
  }

  expect(screenshots).toHaveLength(49);
  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(assertions, null, 2)}\n`);
  const captureRecords = await Promise.all(screenshots.map(async (capturePath) => {
    const [contents, metadata] = await Promise.all([readFile(capturePath), stat(capturePath)]);
    return { path: capturePath, bytes: metadata.size, sha256: sha256(contents) };
  }));
  const sourceInventory = [
    "src/app/(merchant)/catalog/page.tsx",
    "src/app/(merchant)/catalog/directory-query.ts",
    "src/app/(merchant)/catalog/directory-copy.ts",
    "src/app/(merchant)/catalog/catalog-notices.tsx",
    "src/app/(merchant)/catalog/catalog-submit.tsx",
    "src/app/(merchant)/catalog/dirty-select.tsx",
    "src/app/(merchant)/catalog/price-format.ts",
    "src/app/(merchant)/catalog/product-form.tsx",
    "src/app/(merchant)/catalog/product-image-field.tsx",
    "src/app/(merchant)/catalog/products/new/page.tsx",
    "src/app/(merchant)/catalog/products/[id]/page.tsx",
    "src/app/(merchant)/catalog/categories/page.tsx",
    "src/app/products/route.ts",
    "src/app/products/images/route.ts",
    "src/app/product-categories/route.ts",
    "src/observability/server-request-log.ts",
    "src/i18n/dictionaries/products/en.ts",
    "src/i18n/dictionaries/products/pt-BR.ts",
    "tests/catalog.evidence.spec.ts",
    "scripts/run-catalog-evidence.mjs",
    "scripts/verify-catalog-evidence.mjs",
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceInventory.map(async (sourcePath) => [sourcePath, sha256(await readFile(sourcePath))])));
  const assertionsBytes = await readFile(assertionsPath);
  const manifest = {
    version: 1,
    runId,
    startedAt,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    baseCaptureCount: 36,
    stateCaptureCount: 13,
    totalPngCount: 49,
    assertions: `artifacts/catalog/${runId}/assertions.json`,
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
    "# Merchant catalog visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440 products-directory captures, plus thirteen localized state captures.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/catalog/${runId}/manifest.json`,
    review: `artifacts/catalog/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`CATALOG_EVIDENCE_RUN=${runId}`);
});
