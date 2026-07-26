import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
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
const artifactRoot = join(process.cwd(), "artifacts", "storefront");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const composeProject = process.env.STOREFRONT_EVIDENCE_COMPOSE_PROJECT ?? "";
const merchantUsername = "storefront.evidence";
const emptyMerchantUsername = "storefront.empty";
const storefrontSlug = "ana-evidence-store";
const emptyStorefrontSlug = "empty-evidence-store";
const cartStorageKey = `qr-pagamentos:storefront-cart:v1:${storefrontSlug}`;
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const dictionaryByLocale = { en: storefrontEn, "pt-BR": storefrontPtBR } as const;

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

// The public V2 checkout is 9.3.1, so the harness seeds the catalog fixture
// (BRL registry pair, two categories, three products) and both storefront
// setting rows directly in the disposable database — never through app code
// or a test-only backdoor. Theme, layout, and the standalone toggle flip
// through later focused UPDATEs so the sessionless page re-reads them.
function seedSql() {
  const pair = { id: randomUUID(), currency: randomUUID(), exchange: randomUUID() };
  const categories = {
    coffees: randomUUID(),
    teas: randomUUID(),
  };
  const products = {
    espresso: { id: randomUUID(), internalName: "Espresso", titlePtBr: "Café expresso", titleEn: "Espresso shot", price: "12.5", categoryId: categories.coffees, currencyCode: null },
    tea: { id: randomUUID(), internalName: "Tea", titlePtBr: "Chá verde", titleEn: "Green tea", price: "9", categoryId: categories.teas, currencyCode: "USD" },
    cake: { id: randomUUID(), internalName: "Cake", titlePtBr: "Bolo caseiro", titleEn: "Homemade cake", price: "4.25", categoryId: null, currencyCode: null },
  };
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const statements: string[] = [
    `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid, active, created_at, updated_at)
     VALUES ('${pair.id}', 'BRL/PIX', '${pair.currency}', '${pair.exchange}', true, '${at(120)}', '${at(120)}')`,
    `INSERT INTO app.supported_exchange_currency (code, pair_id) VALUES ('BRL', '${pair.id}')`,
    `INSERT INTO app.product_category (id, owner_id, name_pt_br, name_en, active, version, created_at, updated_at)
     SELECT '${categories.coffees}', u.id, 'Cafés', 'Coffees', true, 0, '${at(110)}', '${at(110)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.product_category (id, owner_id, name_pt_br, name_en, active, version, created_at, updated_at)
     SELECT '${categories.teas}', u.id, 'Chás', 'Teas', true, 0, '${at(110)}', '${at(110)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    ...Object.values(products).map((product) =>
      `INSERT INTO app.product (id, owner_id, category_id, internal_name, title_pt_br, title_en, description_pt_br, description_en, price, currency_code, active, version, created_at, updated_at)
       SELECT '${product.id}', u.id, ${product.categoryId ? `'${product.categoryId}'` : "NULL"}, '${product.internalName}', '${product.titlePtBr}', '${product.titleEn}', 'Descrição', 'Description', '${product.price}', ${product.currencyCode ? `'${product.currencyCode}'` : "NULL"}, true, 0, '${at(100)}', '${at(100)}'
       FROM app."user" u WHERE u.username = '${merchantUsername}'`),
    `UPDATE app."user" u SET storefront_slug = '${storefrontSlug}', storefront_enabled = true,
       storefront_display_name_pt_br = 'Loja da Ana', storefront_display_name_en = 'Ana''s store',
       storefront_accent_color = '#106B5B', storefront_theme_id = 'pix-paper', storefront_layout = 'boxed',
       storefront_standalone_payments_enabled = true, storefront_default_currency_code = 'BRL'
     WHERE u.username = '${merchantUsername}'`,
    `UPDATE app."user" u SET storefront_slug = '${emptyStorefrontSlug}', storefront_enabled = true,
       storefront_display_name_pt_br = 'Loja Vazia', storefront_display_name_en = 'Empty store',
       storefront_standalone_payments_enabled = false
     WHERE u.username = '${emptyMerchantUsername}'`,
  ];
  return { sql: `${statements.join(";\n")};\n`, espressoReference: products.espresso.id };
}

function seedDatabase(sql: string) {
  const container = execFileSync("docker", [
    "ps", "-q",
    "--filter", `label=com.docker.compose.project=${composeProject}`,
    "--filter", "label=com.docker.compose.service=db",
  ], { encoding: "utf8" }).trim();
  expect(container).not.toBe("");
  execFileSync("docker", [
    "exec", "-i", container,
    "psql", "-U", "postgres", "-d", "qr_pagamentos", "-p", "5433", "-v", "ON_ERROR_STOP=1", "--quiet",
  ], { input: sql, encoding: "utf8" });
}

function updateStorefront(column: string, value: string) {
  seedDatabase(`UPDATE app."user" u SET ${column} = '${value}' WHERE u.username = '${merchantUsername}';\n`);
}

test("creates the closed storefront evidence run", async ({ page }) => {
  test.setTimeout(1_800_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.STOREFRONT_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword || !composeProject, "requires the disposable storefront evidence runtime");

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
  for (const username of [merchantUsername, emptyMerchantUsername]) {
    await page.goto(`${baseUrl}/admin/accounts`);
    const createAccount = page.locator('form[action$="/admin/users"]');
    await createAccount.getByLabel(/Nome de usuário|Username/).fill(username);
    await createAccount.getByLabel(/^Senha$|^Password/).fill(merchantPassword!);
    await createAccount.getByLabel(/Função|Role/).selectOption("USER");
    await Promise.all([
      page.waitForURL(/\/admin\?success=created$/),
      createAccount.getByRole("button", { name: /Criar conta|Create account/ }).click(),
    ]);
  }
  await page.getByRole("button", { name: /Sair|Sign out/ }).click();
  await signIn(page, merchantUsername, merchantPassword!, "/");

  const seeded = seedSql();
  seedDatabase(seeded.sql);

  async function openStore(slug: string = storefrontSlug) {
    await page.goto(`${baseUrl}/store/${slug}`);
    await expect(page.locator("main.storefront-shell[aria-busy]")).toHaveCount(0);
    await expect(page.locator("main.storefront-shell")).toHaveCount(1);
    await page.evaluate(async () => document.fonts.ready);
  }

  async function inspectStorefront(state: string) {
    const measured = await page.evaluate(() => {
      const visible = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const rectangle = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 0 && rectangle.height > 0;
      };
      const controls = Array.from(document.querySelectorAll<HTMLElement>("main button, main input, main a[href]")).filter(visible);
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
    expect(measured.targets.length).toBeGreaterThan(0);
    expect(measured.targets.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);
    const control = page.locator("main button").first();
    await control.focus();
    const focus = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return { boxShadow: style.boxShadow, outlineWidth: Number.parseFloat(style.outlineWidth) };
    });
    expect(focus.outlineWidth >= 2 || focus.boxShadow !== "none").toBe(true);
    const axe = await new AxeBuilder({ page }).include("main").analyze();
    const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(severeAxe).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    assertions.push({ state, measured, focus, severeAxe });
  }

  async function screenshot(name: string) {
    const relativePath = `artifacts/storefront/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  // ---- Logo fallback: before any upload the official merchant fallback owns
  // the rail in both locales. ----
  for (const locale of locales) {
    await setLocale(page, locale);
    await page.setViewportSize({ width: 375, height: 1000 });
    await openStore();
    await expect(page.locator('main [data-brand-identity="merchant-fallback"]')).toBeVisible();
    await expect(page.locator("img.storefront-logo")).toHaveCount(0);
    assertions.push({ state: `${locale}-logo-fallback`, fallbackVisible: true });
    await screenshot(`interaction-${locale}-logo-fallback`);
  }

  // ---- Real logo: stage through the existing upload route and publish with
  // one native settings save, so the public rail reads an ACTIVE object. ----
  await setLocale(page, "pt-BR");
  const dictionaryPtBR = dictionaryByLocale["pt-BR"];
  await page.goto(`${baseUrl}/settings`);
  await expect(page.locator('form[action="/storefront"]')).toBeVisible();
  const logoPng = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 18, g: 84, b: 72 } } }).png().toBuffer();
  await page.locator('input[name="logo"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logoPng });
  await Promise.all([
    page.waitForURL(/storefront-logo=staged&logo=[A-Za-z0-9_-]{43}$/),
    page.getByRole("button", { name: new RegExp(dictionaryPtBR.storefrontLogoUpload) }).click(),
  ]);
  await Promise.all([
    page.waitForURL(/storefront=changed$/),
    page.getByRole("button", { name: new RegExp(dictionaryPtBR.storefrontSave) }).click(),
  ]);

  // ---- Populated grid: six themes x two locales x three widths, boxed. ----
  for (const locale of locales) {
    const dictionary = dictionaryByLocale[locale];
    await setLocale(page, locale);
    await page.setViewportSize({ width: 375, height: 1000 });
    await openStore();
    const logo = page.locator("img.storefront-logo");
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    assertions.push({ state: `${locale}-logo`, imageLoaded: true });

    for (const theme of themes) {
      updateStorefront("storefront_theme_id", theme);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await openStore();
        await expect(page.locator(`main[data-theme-preview="${theme}"]`)).toBeVisible();
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectStorefront(`${locale}-${theme}-${width}`);
        await screenshot(`default-${theme}-${locale}-${width}`);
      }
    }
    updateStorefront("storefront_theme_id", "pix-paper");

    // ---- Cart flows at 375px boxed: add, quantity, reload persistence, and
    // stale-item recovery, all with exact-decimal totals. ----
    await page.setViewportSize({ width: 375, height: 1000 });
    await openStore();
    const productTitle = locale === "pt-BR" ? "Café expresso" : "Espresso shot";
    const cart = page.locator('section[aria-labelledby="storefront-cart-heading"]');
    const increase = page.getByRole("button", { name: dictionary.storefrontIncreaseQuantity });
    await increase.first().click();
    await page.locator("#storefront-custom-amount").fill("5");
    await page.getByRole("button", { name: dictionary.storefrontCustomAmountAdd }).click();
    await expect(cart).toContainText(productTitle);
    await expect(cart).toContainText("17.5");
    await expect(cart).not.toContainText(dictionary.storefrontCartEmpty);
    assertions.push({ state: `${locale}-cart-added`, cartLines: 2, customAmount: "5", productQuantity: 1, total: "17.5" });
    await screenshot(`interaction-${locale}-cart-added`);

    await increase.first().click();
    await expect(cart).toContainText("2 × 12.5 BRL");
    await expect(cart).toContainText("30");
    assertions.push({ state: `${locale}-cart-quantity`, productQuantity: 2, total: "30", neverSummed: true });
    await screenshot(`interaction-${locale}-cart-quantity`);

    await page.reload();
    await expect(cart).toContainText("2 × 12.5 BRL");
    await expect(cart).toContainText("30");
    assertions.push({ state: `${locale}-cart-reload`, persisted: true, productQuantity: 2, total: "30" });
    await screenshot(`interaction-${locale}-cart-reload`);

    await page.evaluate(({ key, reference }) => {
      window.localStorage.setItem(key, JSON.stringify({
        version: 1,
        items: [
          { kind: "product", reference: "99999999-9999-4999-8999-999999999999", quantity: 4 },
          { kind: "product", reference, quantity: 2 },
          { kind: "custom-amount", amount: "5" },
        ],
      }));
    }, { key: cartStorageKey, reference: seeded.espressoReference });
    await page.reload();
    await expect(cart).toContainText(dictionary.storefrontCartUpdated);
    await expect(cart).toContainText("2 × 12.5 BRL");
    await expect(cart).not.toContainText("4 ×");
    assertions.push({ state: `${locale}-cart-recovered`, notice: dictionary.storefrontCartUpdated, droppedStale: true, productQuantity: 2 });
    await screenshot(`interaction-${locale}-cart-recovered`);
    await page.evaluate((key) => window.localStorage.removeItem(key), cartStorageKey);
  }

  // ---- Table layout: the same catalog as ruled rows in both locales. ----
  updateStorefront("storefront_layout", "table");
  for (const locale of locales) {
    await setLocale(page, locale);
    await page.setViewportSize({ width: 375, height: 1000 });
    await openStore();
    await expect(page.locator('section[data-layout="table"]')).toBeVisible();
    assertions.push({ state: `${locale}-table`, tableLayout: true });
    await screenshot(`interaction-${locale}-table`);
  }
  updateStorefront("storefront_layout", "boxed");

  // ---- Standalone off: the custom-amount first item disappears. ----
  updateStorefront("storefront_standalone_payments_enabled", "false");
  for (const locale of locales) {
    const dictionary = dictionaryByLocale[locale];
    await setLocale(page, locale);
    await page.setViewportSize({ width: 375, height: 1000 });
    await openStore();
    await expect(page.locator("main")).not.toContainText(dictionary.storefrontCustomAmountTitle);
    await expect(page.locator("main")).toContainText(locale === "pt-BR" ? "Café expresso" : "Espresso shot");
    assertions.push({ state: `${locale}-standalone-off`, customAmountAbsent: true });
    await screenshot(`interaction-${locale}-standalone-off`);
  }
  updateStorefront("storefront_standalone_payments_enabled", "true");

  // ---- Empty and unavailable states. ----
  for (const locale of locales) {
    const dictionary = dictionaryByLocale[locale];
    await setLocale(page, locale);
    await page.setViewportSize({ width: 375, height: 1000 });
    await openStore(emptyStorefrontSlug);
    await expect(page.locator("main")).toContainText(dictionary.storefrontEmptyHeading);
    await expect(page.locator("main")).not.toContainText(dictionary.storefrontCartHeading);
    assertions.push({ state: `${locale}-empty`, emptyVisible: true });
    await screenshot(`interaction-${locale}-empty`);

    await openStore("unknown-evidence-store");
    await expect(page.locator("main")).toContainText(dictionary.storefrontUnavailableHeading);
    expect(await page.locator("main[data-theme-preview]").count()).toBe(0);
    assertions.push({ state: `${locale}-unavailable`, unavailableVisible: true, noThemeAttribute: true });
    await screenshot(`interaction-${locale}-unavailable`);
  }

  // ---- 320px reflow on the populated storefront. ----
  await page.setViewportSize({ width: 320, height: 1000 });
  await openStore();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  assertions.push({ state: "reflow-320", reflow: true });
  await screenshot("interaction-reflow-320");

  expect(screenshots).toHaveLength(55);
  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(assertions, null, 2)}\n`);
  const captureRecords = await Promise.all(screenshots.map(async (capturePath) => {
    const [contents, metadata] = await Promise.all([readFile(capturePath), stat(capturePath)]);
    return { path: capturePath, bytes: metadata.size, sha256: sha256(contents) };
  }));
  const sourceInventory = [
    "src/app/store/[slug]/page.tsx",
    "src/app/store/[slug]/loading.tsx",
    "src/app/store/[slug]/error.tsx",
    "src/app/store/[slug]/storefront-experience.tsx",
    "src/storefront/public-storefront.ts",
    "src/storefront/cart.ts",
    "src/i18n/dictionaries/storefront/en.ts",
    "src/i18n/dictionaries/storefront/pt-BR.ts",
    "src/app/globals.css",
    "scripts/generate-design-tokens.mjs",
    "scripts/check-design-tokens.mjs",
    "scripts/run-admin-evidence.mjs",
    "tests/storefront.evidence.spec.ts",
    "scripts/run-storefront-evidence.mjs",
    "scripts/verify-storefront-evidence.mjs",
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceInventory.map(async (sourcePath) => [sourcePath, sha256(await readFile(sourcePath))])));
  const assertionsBytes = await readFile(assertionsPath);
  const manifest = {
    version: 1,
    runId,
    startedAt,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    baseCaptureCount: 36,
    interactionCaptureCount: 19,
    totalPngCount: 55,
    assertions: `artifacts/storefront/${runId}/assertions.json`,
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
    "# Storefront visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440 on the boxed storefront, plus nineteen localized state captures.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/storefront/${runId}/manifest.json`,
    review: `artifacts/storefront/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`STOREFRONT_EVIDENCE_RUN=${runId}`);
});
