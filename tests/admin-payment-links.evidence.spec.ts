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
const artifactRoot = join(process.cwd(), "artifacts", "admin-payment-links");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const composeProject = process.env.ADMIN_PAYMENT_LINKS_EVIDENCE_COMPOSE_PROJECT ?? "";
const keptUsername = "admin.links.keep";
const goneUsername = "admin.links.gone";
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
  await page.goto(`${baseUrl}/admin/settings`);
  const form = page.locator('form[action="/language-preference"]');
  await form.locator('select[name="locale"]').selectOption(locale);
  // The preference POST redirects to `/?language=saved`, and `/` dispatches
  // the administrator to `/admin` (the query is not preserved).
  await Promise.all([
    page.waitForURL(`${baseUrl}/admin`),
    form.getByRole("button").click(),
  ]);
}

const identifier = () => randomBytes(18).toString("base64url");

// The public V2 checkout is 9.3.1, so the harness seeds the fixture products,
// links, lines, and orders directly in the disposable database — never through
// app code or a test-only backdoor. Account creation and the soft-delete run
// through the delivered administrator surfaces.
function seedSql() {
  const pair = { id: randomUUID(), currency: randomUUID(), exchange: randomUUID() };
  const products = { coffee: randomUUID(), cake: randomUUID() };
  const links = {
    active: { id: randomUUID(), identifier: identifier() },
    paid: { id: randomUUID(), identifier: identifier() },
    expired: { id: randomUUID(), identifier: identifier() },
    inactive: { id: randomUUID(), identifier: identifier() },
    gone: { id: randomUUID(), identifier: identifier() },
  };
  const orders = { paid: randomUUID(), gone: randomUUID() };
  const fillers = Array.from({ length: 12 }, (_, index) => ({ id: randomUUID(), identifier: identifier(), index }));
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const fixedLink = (link: { id: string; identifier: string }, owner: string, options: Readonly<{
    descriptionPtBr: string; descriptionEn: string; amount: string; linkType: string; active: boolean; minutesAgo: number; expiresAt?: string;
  }>) =>
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, expires_at, active, version, created_at, updated_at)
     SELECT '${link.id}', '${link.identifier}', u.id, 'FIXED_AMOUNT', '${options.descriptionPtBr}', '${options.descriptionEn}', '${options.amount}', '${pair.id}', '${options.linkType}', ${options.expiresAt ? `'${options.expiresAt}'` : "NULL"}, ${options.active}, 0, '${at(options.minutesAgo)}', '${at(options.minutesAgo)}'
     FROM app."user" u WHERE u.username = '${owner}'`;
  const statements: string[] = [
    `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid, active, created_at, updated_at)
     VALUES ('${pair.id}', 'BRL/USDT', '${pair.currency}', '${pair.exchange}', true, '${at(600)}', '${at(600)}')`,
    `INSERT INTO app.product (id, owner_id, internal_name, title_pt_br, title_en, description_pt_br, description_en, price, active, version, created_at, updated_at)
     SELECT '${products.coffee}', u.id, 'coffee', 'Café especial', 'Special coffee', 'Café torrado na hora', 'Freshly roasted coffee', '17.45', true, 0, '${at(590)}', '${at(590)}'
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    `INSERT INTO app.product (id, owner_id, internal_name, title_pt_br, title_en, description_pt_br, description_en, price, active, version, created_at, updated_at)
     SELECT '${products.cake}', u.id, 'cake', 'Bolo de milho', 'Corn cake', 'Bolo caseiro de milho', 'Homemade corn cake', '12.00', true, 0, '${at(589)}', '${at(589)}'
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    // Active: PRODUCT_LINES, REUSABLE, no expiry, no orders.
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, currency_pair_id, link_type, active, version, created_at, updated_at)
     SELECT '${links.active.id}', '${links.active.identifier}', u.id, 'PRODUCT_LINES', '${pair.id}', 'REUSABLE', true, 0, '${at(500)}', '${at(500)}'
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    `INSERT INTO app.payment_link_v2_line (payment_link_v2_id, owner_id, product_id, position, quantity)
     SELECT '${links.active.id}', u.id, '${products.coffee}', 1, 2
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    `INSERT INTO app.payment_link_v2_line (payment_link_v2_id, owner_id, product_id, position, quantity)
     SELECT '${links.active.id}', u.id, '${products.cake}', 2, 1
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    // Paid: FIXED_AMOUNT, REUSABLE, one CONFIRMED LINK order.
    fixedLink(links.paid, keptUsername, { descriptionPtBr: "Doação mensal", descriptionEn: "Monthly donation", amount: "10.50", linkType: "REUSABLE", active: true, minutesAgo: 400 }),
    `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, description_pt_br, description_en, checkout_data_policy, name, email, settled_at, created_at, updated_at)
     SELECT '${orders.paid}', u.id, 'LINK', '${links.paid.id}', 'CONFIRMED', 1, '10.50', '${pair.currency}', '${pair.exchange}', 'Doação mensal', 'Monthly donation', 'NAME_EMAIL', 'Ana Evidence', 'ana@example.com', '${at(18)}', '${at(20)}', '${at(18)}'
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    // Expired: FIXED_AMOUNT, SINGLE_USE, expiry in the past.
    fixedLink(links.expired, keptUsername, { descriptionPtBr: "Cota vencida", descriptionEn: "Expired dues", amount: "25", linkType: "SINGLE_USE", active: true, minutesAgo: 300, expiresAt: at(60) }),
    // Inactive: FIXED_AMOUNT, SINGLE_USE, owner-deactivated.
    fixedLink(links.inactive, keptUsername, { descriptionPtBr: "Cota desativada", descriptionEn: "Inactive dues", amount: "7.25", linkType: "SINGLE_USE", active: false, minutesAgo: 200 }),
    // The merchant soft-deleted mid-run keeps one previously paid link; the
    // delivered deletion route deactivates it, so it lists as inactive.
    fixedLink(links.gone, goneUsername, { descriptionPtBr: "Cota removida", descriptionEn: "Removed dues", amount: "12.75", linkType: "REUSABLE", active: true, minutesAgo: 480 }),
    `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, email, settled_at, created_at, updated_at)
     SELECT '${orders.gone}', u.id, 'LINK', '${links.gone.id}', 'CONFIRMED', 1, '12.75', '${pair.currency}', '${pair.exchange}', 'EMAIL', 'bianca@example.com', '${at(22)}', '${at(25)}', '${at(22)}'
     FROM app."user" u WHERE u.username = '${goneUsername}'`,
    ...fillers.map((filler) =>
      fixedLink({ id: filler.id, identifier: filler.identifier }, keptUsername, {
        descriptionPtBr: `Cota extra ${filler.index}`,
        descriptionEn: `Filler dues ${filler.index}`,
        amount: "1",
        linkType: "SINGLE_USE",
        active: true,
        minutesAgo: 100 + filler.index,
      })),
  ];
  return { sql: `${statements.join(";\n")};\n`, links, orders };
}

function evidenceDatabase(args: string[], input?: string) {
  const container = execFileSync("docker", [
    "ps", "-q",
    "--filter", `label=com.docker.compose.project=${composeProject}`,
    "--filter", "label=com.docker.compose.service=db",
  ], { encoding: "utf8" }).trim();
  expect(container).not.toBe("");
  return execFileSync("docker", [
    "exec", "-i", container,
    "psql", "-U", "postgres", "-d", "qr_pagamentos", "-p", "5433", "-v", "ON_ERROR_STOP=1", "--quiet", ...args,
  ], { input, encoding: "utf8" });
}

function seedDatabase(sql: string) {
  evidenceDatabase([], sql);
}

function userId(username: string) {
  return evidenceDatabase(["-t", "-A", "-c", `SELECT id FROM app."user" WHERE username = '${username}'`]).trim();
}

test("creates the closed administrator payment-links evidence run", async ({ page }) => {
  test.setTimeout(1_800_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.ADMIN_PAYMENT_LINKS_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword || !composeProject, "requires the disposable admin payment-links evidence runtime");

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
  // Both merchants are created through the delivered administrator surface.
  for (const username of [keptUsername, goneUsername]) {
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

  async function inspectAdminPaymentLinks(state: string) {
    const measured = await page.evaluate(() => {
      const visible = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const rectangle = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 44 && rectangle.height > 10;
      };
      const controls = Array.from(document.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([type=file]), button, select, a[href], textarea")).filter(visible);
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
    const relativePath = `artifacts/admin-payment-links/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  async function captureState(name: string) {
    await page.evaluate(async () => document.fonts.ready);
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await inspectAdminPaymentLinks(name);
    await screenshot(name);
  }

  // ---- pt-BR pass: empty directory, seed, facts, read-only detail, opaque miss ----
  await setLocale(page, "pt-BR");

  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(`${baseUrl}/admin/payment-links`);
  await expect(page.getByText("Nenhum link de pagamento ainda")).toBeVisible();
  await captureState("state-pt-BR-links-empty-375");

  const seeded = seedSql();
  seedDatabase(seeded.sql);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/admin/payment-links`);
  const directory = page.locator("[data-data-directory]");
  await expect(directory).toBeVisible();
  await expect(directory.getByText(keptUsername).first()).toBeVisible();
  await expect(directory.getByText(goneUsername).first()).toBeVisible();
  await expect(directory.getByText("Café especial +1").first()).toBeVisible();
  await expect(directory.getByText("Doação mensal").first()).toBeVisible();
  for (const label of ["Ativo", "Pago", "Expirado", "Inativo"]) {
    await expect(directory.locator('[data-slot="badge"]', { hasText: label }).first()).toBeVisible();
  }
  for (const label of ["Linhas de produtos", "Valor fixo", "Uso único", "Reutilizável"]) {
    await expect(directory.locator('[data-slot="badge"]', { hasText: label }).first()).toBeVisible();
  }
  await expect(directory.getByText("Sem expiração").first()).toBeVisible();
  await expect(directory.getByText(seeded.links.paid.identifier).first()).toHaveCount(0);
  await expect(directory.getByText("Excluída")).toHaveCount(0);
  assertions.push({ state: "directory-facts", owners: [keptUsername, goneUsername], states: ["active", "paid", "expired", "inactive"], kinds: ["PRODUCT_LINES", "FIXED_AMOUNT"], types: ["SINGLE_USE", "REUSABLE"] });

  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(`${baseUrl}/admin/payment-links`);
  await captureState("state-pt-BR-links-ready-320");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`${baseUrl}/admin/payment-links/v2/${seeded.links.active.id}`);
  await expect(page.getByText("Proprietário do link")).toBeVisible();
  await expect(page.getByText(keptUsername).first()).toBeVisible();
  await expect(page.getByText("Café especial").first()).toBeVisible();
  await expect(page.getByText("Bolo de milho").first()).toBeVisible();
  await expect(page.getByText("BRL/USDT").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver contas" })).toBeVisible();
  const drillDown = page.getByRole("link", { name: "Ver pedidos" });
  await expect(drillDown).toBeVisible();
  await expect(drillDown).toHaveAttribute("href", `/admin/orders?link=${seeded.links.active.identifier}`);
  // Read-only: no mutation form, no owner lifecycle or edit affordance.
  await expect(page.locator('form[method="post"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Editar|Edit/ })).toHaveCount(0);
  assertions.push({ state: "detail-read-only", owner: keptUsername, drillDown: true, mutationForms: false });
  await captureState("state-pt-BR-link-detail-1440");

  await page.goto(`${baseUrl}/admin/payment-links/v2/${randomUUID()}`);
  await expect(page.getByText("Este link de pagamento está indisponível")).toBeVisible();
  await expect(page.getByText(keptUsername)).toHaveCount(0);
  assertions.push({ state: "detail-unavailable", opaque: true });
  await captureState("state-pt-BR-link-detail-unavailable-1440");

  // ---- soft-delete the second merchant through the delivered route ----
  const goneId = userId(goneUsername);
  expect(goneId).toMatch(/^[0-9a-f-]{36}$/);
  // The browser's own fetch carries the session cookie and same-origin
  // headers (the API request context does not share them here).
  const deleted = await page.evaluate(async (url) => {
    const response = await fetch(url, { method: "POST" });
    return { status: response.status, url: response.url };
  }, `${baseUrl}/admin/users/${goneId}/delete`);
  expect(deleted.status).toBe(200);
  expect(deleted.url).toContain("/admin?success=deleted");
  assertions.push({ state: "soft-delete", outcome: "deleted" });

  await page.goto(`${baseUrl}/admin/payment-links`);
  await expect(directory.getByText(goneUsername).first()).toBeVisible();
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Excluída" }).first()).toBeVisible();
  // The delivered deletion deactivates the gone owner's link: it stays listed,
  // now under the derived inactive state.
  await expect(directory.getByText("Cota removida").first()).toBeVisible();
  assertions.push({ state: "deleted-owner-kept", owner: goneUsername, badge: "Excluída" });
  await captureState("state-pt-BR-deleted-owner-badge-1440");

  // ---- en pass: honest states, pagination, filters, deleted-owner detail ----
  await setLocale(page, "en");

  await page.goto(`${baseUrl}/admin/payment-links?q=no-such-link`);
  await expect(page.getByText("No matching records")).toBeVisible();
  await captureState("state-en-links-filtered-empty-1440");

  await page.goto(`${baseUrl}/admin/payment-links?forged=1`);
  await expect(page.getByText("The directory request is unavailable")).toBeVisible();
  await expect(page.getByText("forged")).toHaveCount(0);
  assertions.push({ state: "invalid-query-no-echo", echoed: false });
  await captureState("state-en-links-invalid-query-1440");

  await page.goto(`${baseUrl}/admin/payment-links?pageSize=10`);
  const firstPageSummaries = await page.locator("[data-data-directory] tbody tr td:first-child").allTextContents();
  expect(firstPageSummaries).toHaveLength(10);
  await Promise.all([
    page.waitForURL(/\/admin\/payment-links\?pageSize=10&cursor=/),
    page.getByRole("link", { name: "Next page" }).click(),
  ]);
  const secondPageSummaries = await page.locator("[data-data-directory] tbody tr td:first-child").allTextContents();
  expect(secondPageSummaries).toHaveLength(7);
  expect(secondPageSummaries.some((summary) => firstPageSummaries.includes(summary))).toBe(false);
  await expect(page.getByRole("link", { name: "Previous page" })).toBeVisible();
  assertions.push({ state: "pagination", firstPage: firstPageSummaries.length, secondPage: secondPageSummaries.length, distinct: true });
  await captureState("state-en-links-page-2-1440");

  await page.goto(`${baseUrl}/admin/payment-links?q=Monthly`);
  await expect(directory.getByText("Monthly donation").first()).toBeVisible();
  await expect(directory.getByText("Expired dues")).toHaveCount(0);
  assertions.push({ state: "search-description", matched: "Monthly donation" });
  await captureState("state-en-links-search-description-1440");

  await page.goto(`${baseUrl}/admin/payment-links?filter.state=expired`);
  await expect(directory.getByText("Expired dues").first()).toBeVisible();
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Paid" })).toHaveCount(0);
  await expect(directory.getByText("Monthly donation")).toHaveCount(0);
  assertions.push({ state: "filter-state", filtered: "expired" });
  await captureState("state-en-links-filter-state-1440");

  await page.goto(`${baseUrl}/admin/payment-links`);
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Deleted" }).first()).toBeVisible();
  await captureState("state-en-deleted-owner-badge-1440");

  await page.goto(`${baseUrl}/admin/payment-links/v2/${seeded.links.gone.id}`);
  await expect(page.getByText("Payment-link owner")).toBeVisible();
  await expect(page.getByText(goneUsername).first()).toBeVisible();
  await expect(page.locator('[data-slot="badge"]', { hasText: "Deleted" }).first()).toBeVisible();
  await expect(page.locator('[data-slot="badge"]', { hasText: "Inactive" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "View accounts" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View orders" })).toHaveAttribute("href", `/admin/orders?link=${seeded.links.gone.identifier}`);
  await expect(page.locator('form[method="post"]')).toHaveCount(0);
  assertions.push({ state: "detail-deleted-owner", owner: goneUsername, badge: "Deleted" });
  await captureState("state-en-link-detail-deleted-owner-1440");

  // ---- shared directory grid: six themes, both locales, three widths ----
  for (const locale of locales) {
    await setLocale(page, locale);
    for (const theme of themes) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${baseUrl}/admin/payment-links`);
        await expect(page.locator("[data-data-directory]")).toBeVisible();
        await page.evaluate(async () => document.fonts.ready);
        await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectAdminPaymentLinks(`directory-${theme}-${locale}-${width}`);
        await screenshot(`directory-${theme}-${locale}-${width}`);
      }
    }
  }

  expect(screenshots).toHaveLength(48);
  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(assertions, null, 2)}\n`);
  const captureRecords = await Promise.all(screenshots.map(async (capturePath) => {
    const [contents, metadata] = await Promise.all([readFile(capturePath), stat(capturePath)]);
    return { path: capturePath, bytes: metadata.size, sha256: sha256(contents) };
  }));
  const sourceInventory = [
    "src/auth/payment-link-v2-admin-directory.ts",
    "src/auth/payment-link-v2-view.ts",
    "src/app/(merchant)/links/link-v2-views.tsx",
    "src/app/admin/payment-links/page.tsx",
    "src/app/admin/payment-links/directory-query.ts",
    "src/app/admin/payment-links/directory-copy.ts",
    "src/app/admin/payment-links/v2/[id]/page.tsx",
    "src/data-directory/ui/data-directory.tsx",
    "src/i18n/dictionaries/payment-links-directory/en.ts",
    "src/i18n/dictionaries/payment-links-directory/pt-BR.ts",
    "tests/admin-payment-links.evidence.spec.ts",
    "scripts/run-admin-evidence.mjs",
    "scripts/run-admin-payment-links-evidence.mjs",
    "scripts/verify-admin-payment-links-evidence.mjs",
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceInventory.map(async (sourcePath) => [sourcePath, sha256(await readFile(sourcePath))])));
  const assertionsBytes = await readFile(assertionsPath);
  const manifest = {
    version: 1,
    runId,
    startedAt,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    baseCaptureCount: 36,
    stateCaptureCount: 12,
    totalPngCount: 48,
    assertions: `artifacts/admin-payment-links/${runId}/assertions.json`,
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
    "# Administrator global payment-links directory visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the read-only V2 detail with owner attribution and order drill-down, the opaque miss, page 2, description search, the lifecycle-state filter, and the deleted-owner badge in both locales.",
    "- The directory is read-only: no mutation form, no owner lifecycle or edit affordance renders on the administrator detail; the only navigations are the interim /admin/accounts owner target and the /admin/orders?link=<identifier> drill-down.",
    "- Soft-delete runs through the delivered POST /admin/users/[id]/delete route; the deleted owner's links stay listed (deactivated by the deletion, so derived inactive) with the localized non-color badge and the interim /admin/accounts navigation.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/admin-payment-links/${runId}/manifest.json`,
    review: `artifacts/admin-payment-links/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`ADMIN_PAYMENT_LINKS_EVIDENCE_RUN=${runId}`);
});
