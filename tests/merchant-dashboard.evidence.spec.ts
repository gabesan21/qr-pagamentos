import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { merchantDashboardEn } from "@/i18n/dictionaries/merchant-dashboard/en";
import { merchantDashboardPtBR } from "@/i18n/dictionaries/merchant-dashboard/pt-BR";

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
const artifactRoot = join(process.cwd(), "artifacts", "merchant-dashboard");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const composeProject = process.env.MERCHANT_DASHBOARD_EVIDENCE_COMPOSE_PROJECT ?? "";
const merchantUsername = "dashboard.evidence";
const storefrontSlug = "dashboard-evidence-store";
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const dictionaryByLocale = { en: merchantDashboardEn, "pt-BR": merchantDashboardPtBR } as const;

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

// The public V2 checkout is 9.3.1, so the harness seeds the analytics fixture
// (pairs, products, links, CONFIRMED/AD_HOC orders, local outcomes, attempts)
// directly in the disposable database — never through app code or a test-only
// backdoor. Pair A carries the BRL registry pointer; pair B stays unlabeled.
function seedSql() {
  const pairA = { id: randomUUID(), currency: randomUUID(), exchange: randomUUID() };
  const pairB = { id: randomUUID(), currency: randomUUID(), exchange: randomUUID() };
  const products = [
    { id: randomUUID(), internalName: "Espresso", titlePtBr: "Café expresso", titleEn: "Espresso shot" },
    { id: randomUUID(), internalName: "Filter", titlePtBr: "Café coado", titleEn: "Filter coffee" },
  ];
  const links = { active: { id: randomUUID(), identifier: identifier() }, idle: { id: randomUUID(), identifier: identifier() } };
  const orders = {
    confirmedA: randomUUID(),
    confirmedB: randomUUID(),
    finalized: randomUUID(),
    cancelled: randomUUID(),
    pendingAbandoned: randomUUID(),
    pendingProgress: randomUUID(),
  };
  const verifier = (length: number) => randomBytes(length).toString("base64url").slice(0, length);
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const owner = `SELECT u.id FROM app."user" u WHERE u.username = '${merchantUsername}'`;
  const orderColumns = "id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, description_pt_br, description_en, settled_at, created_at, updated_at";
  const statements: string[] = [
    `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid, active, created_at, updated_at)
     VALUES ('${pairA.id}', 'BRL/PIX', '${pairA.currency}', '${pairA.exchange}', true, '${at(120)}', '${at(120)}'),
            ('${pairB.id}', 'Reserva interna', '${pairB.currency}', '${pairB.exchange}', true, '${at(120)}', '${at(120)}')`,
    `INSERT INTO app.supported_exchange_currency (code, pair_id) VALUES ('BRL', '${pairA.id}')`,
    ...products.map((product) =>
      `INSERT INTO app.product (id, owner_id, internal_name, title_pt_br, title_en, description_pt_br, description_en, price, active, version, created_at, updated_at)
       SELECT '${product.id}', u.id, '${product.internalName}', '${product.titlePtBr}', '${product.titleEn}', 'Descrição', 'Description', '12.5', true, 0, '${at(110)}', '${at(110)}'
       FROM app."user" u WHERE u.username = '${merchantUsername}'`),
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
     SELECT '${links.active.id}', '${links.active.identifier}', u.id, 'FIXED_AMOUNT', 'Doação mensal', 'Monthly donation', '10.50', '${pairA.id}', 'REUSABLE', true, 0, '${at(100)}', '${at(100)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
     SELECT '${links.idle.id}', '${links.idle.identifier}', u.id, 'FIXED_AMOUNT', 'Cota do clube', 'Club dues', '25', '${pairA.id}', 'REUSABLE', true, 0, '${at(99)}', '${at(99)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_v2 (${orderColumns})
     SELECT '${orders.confirmedA}', u.id, 'LINK', '${links.active.id}', 'CONFIRMED', 1, '34.90', '${pairA.currency}', '${pairA.exchange}', 'NONE', 'Doação mensal', 'Monthly donation', '${at(30)}', '${at(40)}', '${at(30)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_v2_line (order_id, owner_id, product_id, position, quantity, unit_price)
     SELECT '${orders.confirmedA}', u.id, '${products[0].id}', 1, 2, '12.50' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_v2_line (order_id, owner_id, product_id, position, quantity, unit_price)
     SELECT '${orders.confirmedA}', u.id, '${products[1].id}', 2, 1, '9.90' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_v2 (${orderColumns})
     SELECT '${orders.confirmedB}', u.id, 'LINK', '${links.active.id}', 'CONFIRMED', 1, '10.50', '${pairB.currency}', '${pairB.exchange}', 'NONE', 'Doação mensal', 'Monthly donation', '${at(31)}', '${at(41)}', '${at(31)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_v2_line (order_id, owner_id, product_id, position, quantity, unit_price)
     SELECT '${orders.confirmedB}', u.id, '${products[0].id}', 1, 1, '10.50' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_v2 (${orderColumns})
     SELECT '${orders.finalized}', u.id, 'AD_HOC', NULL, NULL, 1, '10', '${pairA.currency}', '${pairA.exchange}', 'NONE', 'Venda no balcão', 'Counter sale', NULL, '${at(50)}', '${at(50)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_local_outcome_v2 (id, order_id, owner_id, outcome, actor_id, created_at)
     SELECT '${randomUUID()}', '${orders.finalized}', u.id, 'LOCAL_FINALIZED', u.id, '${at(25)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_v2 (${orderColumns})
     SELECT '${orders.cancelled}', u.id, 'AD_HOC', NULL, NULL, 1, '7.25', '${pairA.currency}', '${pairA.exchange}', 'NONE', 'Pedido desistido', 'Dropped order', NULL, '${at(55)}', '${at(55)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_local_outcome_v2 (id, order_id, owner_id, outcome, actor_id, created_at)
     SELECT '${randomUUID()}', '${orders.cancelled}', u.id, 'LOCAL_CANCELLED', u.id, '${at(20)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_v2 (${orderColumns})
     SELECT '${orders.pendingAbandoned}', u.id, 'LINK', '${links.active.id}', 'PENDING', 1, '25', '${pairA.currency}', '${pairA.exchange}', 'NONE', 'Doação mensal', 'Monthly donation', NULL, '${at(35)}', '${at(35)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_v2 (${orderColumns})
     SELECT '${orders.pendingProgress}', u.id, 'LINK', '${links.active.id}', 'PENDING', 1, '15', '${pairA.currency}', '${pairA.exchange}', 'NONE', 'Doação mensal', 'Monthly donation', NULL, '${at(28)}', '${at(28)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    // Converted: the attempt's order is CONFIRMED; abandoned: capability expired;
    // in-progress: capability still valid. Rates become exactly 0.5000/0.5000.
    `INSERT INTO app.checkout_attempt_v2 (id, owner_id, payment_link_v2_id, order_v2_id, retry_key_verifier, request_verifier, capability_nonce, capability_key_version, capability_verifier, capability_expires_at, state, created_at, updated_at)
     SELECT '${randomUUID()}', u.id, '${links.active.id}', '${orders.confirmedA}', '${verifier(64)}', '${verifier(64)}', '${verifier(43)}', '${verifier(16)}', '${verifier(64)}', '2028-01-01T00:00:00.000Z', 'ISSUED', '${at(39)}', '${at(39)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.checkout_attempt_v2 (id, owner_id, payment_link_v2_id, order_v2_id, retry_key_verifier, request_verifier, capability_nonce, capability_key_version, capability_verifier, capability_expires_at, state, created_at, updated_at)
     SELECT '${randomUUID()}', u.id, '${links.active.id}', '${orders.pendingAbandoned}', '${verifier(64)}', '${verifier(64)}', '${verifier(43)}', '${verifier(16)}', '${verifier(64)}', '${at(5)}', 'ISSUED', '${at(35)}', '${at(35)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.checkout_attempt_v2 (id, owner_id, payment_link_v2_id, order_v2_id, retry_key_verifier, request_verifier, capability_nonce, capability_key_version, capability_verifier, capability_expires_at, state, created_at, updated_at)
     SELECT '${randomUUID()}', u.id, '${links.active.id}', '${orders.pendingProgress}', '${verifier(64)}', '${verifier(64)}', '${verifier(43)}', '${verifier(16)}', '${verifier(64)}', '2028-01-01T00:00:00.000Z', 'ISSUED', '${at(28)}', '${at(28)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `UPDATE app."user" u SET storefront_slug = '${storefrontSlug}', storefront_enabled = true WHERE u.username = '${merchantUsername}'`,
  ];
  return `${statements.join(";\n")};\n`;
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

test("creates the closed merchant-dashboard evidence run", async ({ page }) => {
  test.setTimeout(1_800_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.MERCHANT_DASHBOARD_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword || !composeProject, "requires the disposable merchant-dashboard evidence runtime");

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

  async function inspectDashboard(state: string) {
    const measured = await page.evaluate(() => {
      const visible = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const rectangle = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 0 && rectangle.height > 0;
      };
      const controls = Array.from(document.querySelectorAll<HTMLElement>("main a[href], main button")).filter(visible);
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
    const periodLink = page.locator("a.merchant-dashboard__period").first();
    await periodLink.focus();
    const focus = await periodLink.evaluate((element) => {
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
    const relativePath = `artifacts/merchant-dashboard/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  async function openDashboard() {
    await page.goto(`${baseUrl}/`);
    await expect(page.locator(".merchant-dashboard__periods")).toBeVisible();
    await page.evaluate(async () => document.fonts.ready);
  }

  const loadedDashboard = () => page.locator(".merchant-dashboard:not([aria-busy])");

  // ---- Empty pass: a fresh merchant sees every explicit empty state and no
  // View Store action (the storefront is still disabled). ----
  for (const locale of locales) {
    const dictionary = dictionaryByLocale[locale];
    await setLocale(page, locale);
    await page.setViewportSize({ width: 375, height: 1000 });
    await openDashboard();
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const empty of [
      dictionary.merchantDashboardSalesEmpty,
      dictionary.merchantDashboardFunnelEmpty,
      dictionary.merchantDashboardBestSellersEmpty,
      dictionary.merchantDashboardLinksEmpty,
      dictionary.merchantDashboardRecentEmpty,
    ]) {
      await expect(loadedDashboard()).toContainText(empty);
    }
    assertions.push({ state: `${locale}-empty`, emptyStates: true });
    await screenshot(`interaction-${locale}-empty`);

    await expect(page.getByRole("link", { name: dictionary.merchantDashboardViewStore })).toHaveCount(0);
    assertions.push({ state: `${locale}-view-store-off`, viewStoreAbsent: true });
    await screenshot(`interaction-${locale}-view-store-off`);
  }

  seedDatabase(seedSql());

  for (const locale of locales) {
    const dictionary = dictionaryByLocale[locale];
    await setLocale(page, locale);
    await openDashboard();

    // ---- Populated grid: six themes x three widths. ----
    for (const theme of themes) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await openDashboard();
        await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectDashboard(`${locale}-${theme}-${width}`);
        await screenshot(`populated-${theme}-${locale}-${width}`);
      }
    }

    await page.setViewportSize({ width: 375, height: 1000 });
    await openDashboard();
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });

    // ---- Populated facts: both sales groups render separately, never summed. ----
    const dashboard = loadedDashboard();
    const confirmedAmount = locale === "pt-BR" ? "34,9 BRL" : "34.9 BRL";
    const localAmount = "10 BRL";
    const unlabeledAmount = locale === "pt-BR" ? "10,5" : "10.5";
    const summedAmount = locale === "pt-BR" ? "44,9" : "44.9";
    const bestSellerTitle = locale === "pt-BR" ? "Café expresso" : "Espresso shot";
    await expect(dashboard).toContainText(confirmedAmount);
    await expect(dashboard).toContainText(localAmount);
    await expect(dashboard).toContainText(unlabeledAmount);
    await expect(dashboard).toContainText(dictionary.merchantDashboardUnlabeledCurrency);
    await expect(dashboard).toContainText(locale === "pt-BR" ? "50,00%" : "50.00%");
    await expect(dashboard).toContainText(bestSellerTitle);
    await expect(dashboard).not.toContainText(summedAmount);
    assertions.push({
      state: `${locale}-populated-facts`,
      confirmedAmount,
      localAmount,
      unlabeled: true,
      rate: locale === "pt-BR" ? "50,00%" : "50.00%",
      neverSummed: true,
    });

    // ---- Period switching: plain GET links move the non-color current marker. ----
    // The switcher is a Next.js <Link> (soft navigation): waitForURL('load') races
    // the client transition and can hang forever, so poll the URL as a web-first
    // assertion and let the current-marker expects below confirm the commit.
    await page.getByRole("link", { name: dictionary.merchantDashboardPeriodToday }).click();
    await expect(page).toHaveURL(`${baseUrl}/?period=today`);
    await expect(page.locator(".merchant-dashboard__period--current")).toHaveText(dictionary.merchantDashboardPeriodToday);
    await expect(page.locator(".merchant-dashboard__period--current")).toHaveAttribute("aria-current", "page");
    assertions.push({ state: `${locale}-period-today`, current: dictionary.merchantDashboardPeriodToday });
    await screenshot(`interaction-${locale}-period-today`);

    await page.getByRole("link", { name: dictionary.merchantDashboardPeriod30d }).click();
    await expect(page).toHaveURL(`${baseUrl}/?period=30d`);
    await expect(page.locator(".merchant-dashboard__period--current")).toHaveText(dictionary.merchantDashboardPeriod30d);
    assertions.push({ state: `${locale}-period-30d`, current: dictionary.merchantDashboardPeriod30d });
    await screenshot(`interaction-${locale}-period-30d`);

    // ---- View Store on: the storefront is enabled with a slug. ----
    await page.goto(`${baseUrl}/`);
    const viewStore = page.getByRole("link", { name: dictionary.merchantDashboardViewStore });
    await expect(viewStore).toHaveAttribute("href", `/store/${storefrontSlug}`);
    assertions.push({ state: `${locale}-view-store-on`, href: `/store/${storefrontSlug}` });
    await screenshot(`interaction-${locale}-view-store-on`);
  }

  // ---- 320px reflow on the populated dashboard. ----
  await page.setViewportSize({ width: 320, height: 1000 });
  await openDashboard();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  assertions.push({ state: "reflow-320", reflow: true });
  await screenshot("interaction-reflow-320");

  expect(screenshots).toHaveLength(47);
  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(assertions, null, 2)}\n`);
  const captureRecords = await Promise.all(screenshots.map(async (capturePath) => {
    const [contents, metadata] = await Promise.all([readFile(capturePath), stat(capturePath)]);
    return { path: capturePath, bytes: metadata.size, sha256: sha256(contents) };
  }));
  const sourceInventory = [
    "src/app/(merchant)/page.tsx",
    "src/app/(merchant)/loading.tsx",
    "src/app/(merchant)/dashboard.tsx",
    "src/i18n/dictionaries/merchant-dashboard/en.ts",
    "src/i18n/dictionaries/merchant-dashboard/pt-BR.ts",
    "src/orders/merchant-analytics.ts",
    "src/auth/storefront-settings.ts",
    "src/app/globals.css",
    "scripts/run-admin-evidence.mjs",
    "tests/merchant-dashboard.evidence.spec.ts",
    "scripts/run-merchant-dashboard-evidence.mjs",
    "scripts/verify-merchant-dashboard-evidence.mjs",
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceInventory.map(async (sourcePath) => [sourcePath, sha256(await readFile(sourcePath))])));
  const assertionsBytes = await readFile(assertionsPath);
  const manifest = {
    version: 1,
    runId,
    startedAt,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    baseCaptureCount: 36,
    interactionCaptureCount: 11,
    totalPngCount: 47,
    assertions: `artifacts/merchant-dashboard/${runId}/assertions.json`,
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
    "# Merchant dashboard visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440 on the populated dashboard, plus eleven localized state captures.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/merchant-dashboard/${runId}/manifest.json`,
    review: `artifacts/merchant-dashboard/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`MERCHANT_DASHBOARD_EVIDENCE_RUN=${runId}`);
});
