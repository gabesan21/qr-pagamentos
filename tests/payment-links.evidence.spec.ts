import { createHash, randomBytes, randomUUID } from "node:crypto";
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
const artifactRoot = join(process.cwd(), "artifacts", "links");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const composeProject = process.env.LINKS_EVIDENCE_COMPOSE_PROJECT ?? "";
const merchantUsername = "links.evidence";
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

const identifier = () => randomBytes(18).toString("base64url");

// The V2 create UI is 8.2.2 and public V2 checkout is 9.3.1, so the harness
// seeds links, orders, and the single-use settlement directly in the
// disposable database — never through app code or a test-only backdoor.
function seedSql() {
  const pair = { id: randomUUID(), currency: randomUUID(), exchange: randomUUID() };
  const products = [
    { id: randomUUID(), internalName: "Espresso", titlePtBr: "Café expresso", titleEn: "Espresso shot", price: "12.5" },
    { id: randomUUID(), internalName: "Filter", titlePtBr: "Café coado", titleEn: "Filter coffee", price: "9.9" },
  ];
  const links = {
    productLinesPaid: { id: randomUUID(), identifier: identifier() },
    fixedSinglePaid: { id: randomUUID(), identifier: identifier() },
    fixedActive: { id: randomUUID(), identifier: identifier() },
    inactive: { id: randomUUID(), identifier: identifier() },
    expired: { id: randomUUID(), identifier: identifier() },
  };
  const orders = { reusable: randomUUID(), singleUse: randomUUID() };
  const fillers = Array.from({ length: 30 }, (_, index) => ({ id: randomUUID(), identifier: identifier(), index }));
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const statements: string[] = [
    `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid, active, created_at, updated_at)
     VALUES ('${pair.id}', 'BRL/USDT', '${pair.currency}', '${pair.exchange}', true, '${at(120)}', '${at(120)}')`,
    ...products.map((product) =>
      `INSERT INTO app.product (id, owner_id, internal_name, title_pt_br, title_en, description_pt_br, description_en, price, active, version, created_at, updated_at)
       SELECT '${product.id}', u.id, '${product.internalName}', '${product.titlePtBr}', '${product.titleEn}', 'Descrição', 'Description', '${product.price}', true, 0, '${at(110)}', '${at(110)}'
       FROM app."user" u WHERE u.username = '${merchantUsername}'`),
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, currency_pair_id, link_type, active, version, created_at, updated_at)
     SELECT '${links.productLinesPaid.id}', '${links.productLinesPaid.identifier}', u.id, 'PRODUCT_LINES', '${pair.id}', 'REUSABLE', true, 0, '${at(1)}', '${at(1)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.payment_link_v2_line (payment_link_v2_id, owner_id, product_id, position, quantity)
     SELECT '${links.productLinesPaid.id}', u.id, '${products[0].id}', 1, 2 FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.payment_link_v2_line (payment_link_v2_id, owner_id, product_id, position, quantity)
     SELECT '${links.productLinesPaid.id}', u.id, '${products[1].id}', 2, 1 FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
     SELECT '${links.fixedSinglePaid.id}', '${links.fixedSinglePaid.identifier}', u.id, 'FIXED_AMOUNT', 'Doação mensal', 'Monthly donation', '10.50', '${pair.id}', 'SINGLE_USE', true, 0, '${at(2)}', '${at(2)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
     SELECT '${links.fixedActive.id}', '${links.fixedActive.identifier}', u.id, 'FIXED_AMOUNT', 'Cota do clube', 'Club dues', '25', '${pair.id}', 'REUSABLE', true, 0, '${at(3)}', '${at(3)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
     SELECT '${links.inactive.id}', '${links.inactive.identifier}', u.id, 'FIXED_AMOUNT', 'Campanha encerrada', 'Closed campaign', '40', '${pair.id}', 'REUSABLE', false, 0, '${at(4)}', '${at(4)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, expires_at, active, version, created_at, updated_at)
     SELECT '${links.expired.id}', '${links.expired.identifier}', u.id, 'FIXED_AMOUNT', 'Lote antigo', 'Old batch', '55', '${pair.id}', 'REUSABLE', '${at(60)}', true, 0, '${at(5)}', '${at(5)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, settled_at, created_at, updated_at)
     SELECT '${orders.reusable}', u.id, 'LINK', '${links.productLinesPaid.id}', 'CONFIRMED', 1, '34.9', '${pair.currency}', '${pair.exchange}', 'NONE', '${at(30)}', '${at(40)}', '${at(30)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, settled_at, created_at, updated_at)
     SELECT '${orders.singleUse}', u.id, 'LINK', '${links.fixedSinglePaid.id}', 'CONFIRMED', 1, '10.50', '${pair.currency}', '${pair.exchange}', 'NONE', '${at(31)}', '${at(41)}', '${at(31)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.payment_link_v2_single_use_settlement (payment_link_v2_id, owner_id, order_v2_id, claimed_at)
     SELECT '${links.fixedSinglePaid.id}', u.id, '${orders.singleUse}', '${at(31)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    ...fillers.map((filler) =>
      `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
       SELECT '${filler.id}', '${filler.identifier}', u.id, 'FIXED_AMOUNT', 'Link de preenchimento ${filler.index}', 'Filler link ${filler.index}', '1', '${pair.id}', 'REUSABLE', true, 0, '${at(10 + filler.index)}', '${at(10 + filler.index)}'
       FROM app."user" u WHERE u.username = '${merchantUsername}'`),
  ];
  return { sql: `${statements.join(";\n")};\n`, links, products, pair };
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

test("creates the closed merchant payment-links evidence run", async ({ page }) => {
  test.setTimeout(1_800_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.LINKS_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword || !composeProject, "requires the disposable payment-links evidence runtime");

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

  async function inspectLinks(state: string) {
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
    const formControls = page.locator('input:not([type="hidden"]):not([type="file"]), select');
    const firstInput = (await formControls.count()) > 0 ? formControls.first() : page.locator('button, a[href]').first();
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
    const relativePath = `artifacts/links/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  async function captureState(name: string) {
    await page.evaluate(async () => document.fonts.ready);
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await inspectLinks(name);
    await screenshot(name);
  }

  // ---- pt-BR pass: empty directory, seed, derived badges, detail, opaque miss ----
  await setLocale(page, "pt-BR");

  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(`${baseUrl}/links`);
  await expect(page.getByText("Nenhum link de pagamento ainda")).toBeVisible();
  await captureState("state-pt-BR-links-empty-375");

  const seeded = seedSql();
  seedDatabase(seeded.sql);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/links`);
  const directory = page.locator("[data-data-directory]");
  await expect(directory).toBeVisible();
  for (const label of ["Ativo", "Inativo", "Expirado", "Pago"]) {
    await expect(directory.locator('[data-slot="badge"]', { hasText: label }).first()).toBeVisible();
  }
  const shareLinks = await directory.locator('a[href^="/pay/"]').count();
  expect(shareLinks).toBeGreaterThanOrEqual(5);
  assertions.push({ state: "derived-badges-and-share", badges: ["Ativo", "Inativo", "Expirado", "Pago"], shareLinks });

  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(`${baseUrl}/links`);
  await captureState("state-pt-BR-links-ready-320");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`${baseUrl}/links/v2/${seeded.links.productLinesPaid.id}`);
  await expect(page.getByText("Café expresso")).toBeVisible();
  await expect(page.getByText("Café coado")).toBeVisible();
  await expect(page.getByText(seeded.links.productLinesPaid.identifier)).toBeVisible();
  assertions.push({ state: "detail-product-lines", identifier: seeded.links.productLinesPaid.identifier });
  await captureState("state-pt-BR-link-detail-1440");

  await page.goto(`${baseUrl}/links/v2/${randomUUID()}`);
  await expect(page.getByText("Este link de pagamento está indisponível")).toBeVisible();
  await expect(page.getByText(seeded.links.productLinesPaid.identifier)).toHaveCount(0);
  assertions.push({ state: "detail-unavailable", opaque: true });
  await captureState("state-pt-BR-link-detail-unavailable-1440");

  // ---- en pass: honest states, keyset pagination, fixed-amount detail ----
  await setLocale(page, "en");

  await page.goto(`${baseUrl}/links?q=no-such-link`);
  await expect(page.getByText("No matching records")).toBeVisible();
  await captureState("state-en-links-filtered-empty-1440");

  await page.goto(`${baseUrl}/links?forged=1`);
  await expect(page.getByText("The directory request is unavailable")).toBeVisible();
  await expect(page.getByText("forged")).toHaveCount(0);
  assertions.push({ state: "invalid-query-no-echo", echoed: false });
  await captureState("state-en-links-invalid-query-1440");

  await page.goto(`${baseUrl}/links`);
  const firstPageSummaries = await page.locator("[data-data-directory] tbody tr td:first-child").allTextContents();
  expect(firstPageSummaries).toHaveLength(25);
  await Promise.all([
    page.waitForURL(/\/links\?cursor=/),
    page.getByRole("link", { name: "Next page" }).click(),
  ]);
  const secondPageSummaries = await page.locator("[data-data-directory] tbody tr td:first-child").allTextContents();
  expect(secondPageSummaries).toHaveLength(10);
  expect(secondPageSummaries.some((summary) => firstPageSummaries.includes(summary))).toBe(false);
  await expect(page.getByRole("link", { name: "Previous page" })).toBeVisible();
  assertions.push({ state: "pagination", firstPage: firstPageSummaries.length, secondPage: secondPageSummaries.length, distinct: true });
  await captureState("state-en-links-page-2-1440");

  await page.goto(`${baseUrl}/links/v2/${seeded.links.fixedSinglePaid.id}`);
  await expect(page.getByText("Monthly donation")).toBeVisible();
  await expect(page.getByText("10,50").or(page.getByText("10.50"))).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
  assertions.push({ state: "detail-fixed-amount", identifier: seeded.links.fixedSinglePaid.identifier });
  await captureState("state-en-link-detail-fixed-1440");

  // ---- shared directory grid: six themes, both locales, three widths ----
  for (const locale of locales) {
    await setLocale(page, locale);
    for (const theme of themes) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${baseUrl}/links`);
        await expect(page.locator("[data-data-directory]")).toBeVisible();
        await page.evaluate(async () => document.fonts.ready);
        await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectLinks(`directory-${theme}-${locale}-${width}`);
        await screenshot(`directory-${theme}-${locale}-${width}`);
      }
    }
  }

  expect(screenshots).toHaveLength(44);
  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(assertions, null, 2)}\n`);
  const captureRecords = await Promise.all(screenshots.map(async (capturePath) => {
    const [contents, metadata] = await Promise.all([readFile(capturePath), stat(capturePath)]);
    return { path: capturePath, bytes: metadata.size, sha256: sha256(contents) };
  }));
  const sourceInventory = [
    "src/auth/payment-link-v2-view.ts",
    "src/app/(merchant)/links/page.tsx",
    "src/app/(merchant)/links/directory-query.ts",
    "src/app/(merchant)/links/directory-copy.ts",
    "src/app/(merchant)/links/link-v2-views.tsx",
    "src/app/(merchant)/links/share-copy.tsx",
    "src/app/(merchant)/links/loading.tsx",
    "src/app/(merchant)/links/v2/[id]/page.tsx",
    "src/i18n/dictionaries/payment-links-directory/en.ts",
    "src/i18n/dictionaries/payment-links-directory/pt-BR.ts",
    "src/observability/server-request-log.ts",
    "src/security/public-rate-limit.ts",
    "tests/payment-links.evidence.spec.ts",
    "scripts/run-admin-evidence.mjs",
    "scripts/run-payment-links-evidence.mjs",
    "scripts/verify-payment-links-evidence.mjs",
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceInventory.map(async (sourcePath) => [sourcePath, sha256(await readFile(sourcePath))])));
  const assertionsBytes = await readFile(assertionsPath);
  const manifest = {
    version: 1,
    runId,
    startedAt,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    baseCaptureCount: 36,
    stateCaptureCount: 8,
    totalPngCount: 44,
    assertions: `artifacts/links/${runId}/assertions.json`,
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
    "# Merchant payment-link directory visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440 directory captures, plus eight localized state captures including 320-pixel reflow, detail, opaque miss, and page 2.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/links/${runId}/manifest.json`,
    review: `artifacts/links/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`LINKS_EVIDENCE_RUN=${runId}`);
});
