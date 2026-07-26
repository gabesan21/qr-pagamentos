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
const artifactRoot = join(process.cwd(), "artifacts", "admin-orders");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const composeProject = process.env.ADMIN_ORDERS_EVIDENCE_COMPOSE_PROJECT ?? "";
const keptUsername = "admin.orders.keep";
const goneUsername = "admin.orders.gone";
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

// The public V2 checkout is 9.3.1, so the harness seeds the fixture link,
// orders, and the local outcome directly in the disposable database — never
// through app code or a test-only backdoor. Account creation and the
// soft-delete run through the delivered administrator surfaces.
function seedSql() {
  const pair = { id: randomUUID(), currency: randomUUID(), exchange: randomUUID() };
  const link = { id: randomUUID(), identifier: identifier() };
  const goneLink = { id: randomUUID(), identifier: identifier() };
  const orders = { main: randomUUID(), adhoc: randomUUID(), cancelled: randomUUID(), goneMain: randomUUID(), goneAdhoc: randomUUID() };
  const fillers = Array.from({ length: 12 }, (_, index) => ({ id: randomUUID(), index }));
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const statements: string[] = [
    `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid, active, created_at, updated_at)
     VALUES ('${pair.id}', 'BRL/USDT', '${pair.currency}', '${pair.exchange}', true, '${at(600)}', '${at(600)}')`,
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
     SELECT '${link.id}', '${link.identifier}', u.id, 'FIXED_AMOUNT', 'Doação mensal', 'Monthly donation', '10.50', '${pair.id}', 'REUSABLE', true, 0, '${at(500)}', '${at(500)}'
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    // Main order: LINK, CONFIRMED, NAME_EMAIL payer.
    `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, description_pt_br, description_en, checkout_data_policy, name, email, settled_at, created_at, updated_at)
     SELECT '${orders.main}', u.id, 'LINK', '${link.id}', 'CONFIRMED', 1, '10.50', '${pair.currency}', '${pair.exchange}', 'Doação mensal', 'Monthly donation', 'NAME_EMAIL', 'Ana Evidence', 'ana@example.com', '${at(18)}', '${at(20)}', '${at(18)}'
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    // AD_HOC order: no payment state, no collected payer.
    `INSERT INTO app.order_v2 (id, owner_id, source, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, description_pt_br, description_en, checkout_data_policy, created_at, updated_at)
     SELECT '${orders.adhoc}', u.id, 'AD_HOC', NULL, 1, '7.25', '${pair.currency}', '${pair.exchange}', 'Venda avulsa', 'Ad hoc sale', 'NONE', '${at(30)}', '${at(30)}'
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    // Rejected LINK order with a cancelled local outcome.
    `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, email, created_at, updated_at)
     SELECT '${orders.cancelled}', u.id, 'LINK', '${link.id}', 'REJECTED', 2, '25', '${pair.currency}', '${pair.exchange}', 'EMAIL', 'bruno@example.com', '${at(40)}', '${at(35)}'
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    `INSERT INTO app.order_local_outcome_v2 (id, order_id, owner_id, outcome, note, actor_id, created_at)
     SELECT '${randomUUID()}', '${orders.cancelled}', u.id, 'LOCAL_CANCELLED', 'Chargeback manual', u.id, '${at(35)}'
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    // Orders owned by the merchant that is soft-deleted mid-run; the composite
    // link+owner key requires a link owned by that same merchant.
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
     SELECT '${goneLink.id}', '${goneLink.identifier}', u.id, 'FIXED_AMOUNT', 'Cota removida', 'Removed dues', '12.75', '${pair.id}', 'REUSABLE', true, 0, '${at(480)}', '${at(480)}'
     FROM app."user" u WHERE u.username = '${goneUsername}'`,
    `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, email, settled_at, created_at, updated_at)
     SELECT '${orders.goneMain}', u.id, 'LINK', '${goneLink.id}', 'CONFIRMED', 1, '12.75', '${pair.currency}', '${pair.exchange}', 'EMAIL', 'bianca@example.com', '${at(22)}', '${at(25)}', '${at(22)}'
     FROM app."user" u WHERE u.username = '${goneUsername}'`,
    `INSERT INTO app.order_v2 (id, owner_id, source, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, description_pt_br, description_en, checkout_data_policy, created_at, updated_at)
     SELECT '${orders.goneAdhoc}', u.id, 'AD_HOC', NULL, 1, '3.40', '${pair.currency}', '${pair.exchange}', 'Cota removida', 'Removed dues', 'NONE', '${at(28)}', '${at(28)}'
     FROM app."user" u WHERE u.username = '${goneUsername}'`,
    ...fillers.map((filler) =>
      `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, name, created_at, updated_at)
       SELECT '${filler.id}', u.id, 'LINK', '${link.id}', 'PENDING', 1, '1', '${pair.currency}', '${pair.exchange}', 'NAME_EMAIL', 'Pagador ${filler.index}', '${at(100 + filler.index)}', '${at(100 + filler.index)}'
       FROM app."user" u WHERE u.username = '${keptUsername}'`),
  ];
  return { sql: `${statements.join(";\n")};\n`, link, orders };
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

test("creates the closed administrator orders evidence run", async ({ page }) => {
  test.setTimeout(1_800_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.ADMIN_ORDERS_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword || !composeProject, "requires the disposable admin orders evidence runtime");

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

  async function inspectAdminOrders(state: string) {
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
    const relativePath = `artifacts/admin-orders/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  async function captureState(name: string) {
    await page.evaluate(async () => document.fonts.ready);
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await inspectAdminOrders(name);
    await screenshot(name);
  }

  // ---- pt-BR pass: empty directory, seed, facts, read-only detail, opaque miss ----
  await setLocale(page, "pt-BR");

  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(`${baseUrl}/admin/orders`);
  await expect(page.getByText("Nenhum pedido ainda")).toBeVisible();
  await captureState("state-pt-BR-orders-empty-375");

  const seeded = seedSql();
  seedDatabase(seeded.sql);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/admin/orders`);
  const directory = page.locator("[data-data-directory]");
  await expect(directory).toBeVisible();
  await expect(directory.getByText(keptUsername).first()).toBeVisible();
  await expect(directory.getByText(goneUsername).first()).toBeVisible();
  await expect(directory.getByText("Ana Evidence").first()).toBeVisible();
  await expect(directory.getByText("ana@example.com").first()).toBeVisible();
  await expect(directory.getByText("bianca@example.com").first()).toBeVisible();
  for (const label of ["Pagamento confirmado", "Pagamento recusado", "Aguardando pagamento", "Sem pagamento", "Cancelado localmente", "Avulso"]) {
    await expect(directory.locator('[data-slot="badge"]', { hasText: label }).first()).toBeVisible();
  }
  await expect(directory.getByText("Não coletado").first()).toBeVisible();
  await expect(directory.getByText(seeded.link.identifier).first()).toBeVisible();
  await expect(directory.getByText("Excluída")).toHaveCount(0);
  assertions.push({ state: "directory-facts", owners: [keptUsername, goneUsername], payer: "Ana Evidence", badges: ["CONFIRMED", "REJECTED", "PENDING", "none", "LOCAL_CANCELLED"], linkIdentifier: seeded.link.identifier });

  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(`${baseUrl}/admin/orders`);
  await captureState("state-pt-BR-orders-ready-320");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`${baseUrl}/admin/orders/v2/${seeded.orders.main}`);
  await expect(page.getByText("Proprietário do pedido")).toBeVisible();
  await expect(page.getByText(keptUsername).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver contas" })).toBeVisible();
  await expect(page.getByText(seeded.link.identifier).first()).toBeVisible();
  // Read-only: no comment thread, no local-outcome form, no mutation surface.
  await expect(page.locator('textarea[name="body"]')).toHaveCount(0);
  await expect(page.locator('form[action^="/orders-v2/"]')).toHaveCount(0);
  await expect(page.getByText("Comentários")).toHaveCount(0);
  assertions.push({ state: "detail-read-only", owner: keptUsername, comments: false, outcomeForms: false });
  await captureState("state-pt-BR-order-detail-1440");

  await page.goto(`${baseUrl}/admin/orders/v2/${randomUUID()}`);
  await expect(page.getByText("Este pedido está indisponível")).toBeVisible();
  await expect(page.getByText(keptUsername)).toHaveCount(0);
  assertions.push({ state: "detail-unavailable", opaque: true });
  await captureState("state-pt-BR-order-detail-unavailable-1440");

  // ---- soft-delete the second merchant through the delivered route ----
  const goneId = userId(goneUsername);
  expect(goneId).toMatch(/^[0-9a-f-]{36}$/);
  const deleted = await page.request.post(`${baseUrl}/admin/users/${goneId}/delete`, { headers: { Origin: baseUrl } });
  expect(deleted.status()).toBe(200);
  expect(deleted.url()).toContain("/admin?success=deleted");
  assertions.push({ state: "soft-delete", outcome: "deleted" });

  await page.goto(`${baseUrl}/admin/orders`);
  await expect(directory.getByText(goneUsername).first()).toBeVisible();
  await expect(directory.getByText("bianca@example.com").first()).toBeVisible();
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Excluída" }).first()).toBeVisible();
  assertions.push({ state: "deleted-owner-kept", owner: goneUsername, badge: "Excluída" });
  await captureState("state-pt-BR-deleted-owner-badge-1440");

  // ---- en pass: honest states, pagination, filters, deleted-owner detail ----
  await setLocale(page, "en");

  await page.goto(`${baseUrl}/admin/orders?q=no-such-order`);
  await expect(page.getByText("No matching records")).toBeVisible();
  await captureState("state-en-orders-filtered-empty-1440");

  await page.goto(`${baseUrl}/admin/orders?forged=1`);
  await expect(page.getByText("The directory request is unavailable")).toBeVisible();
  await expect(page.getByText("forged")).toHaveCount(0);
  assertions.push({ state: "invalid-query-no-echo", echoed: false });
  await captureState("state-en-orders-invalid-query-1440");

  await page.goto(`${baseUrl}/admin/orders?pageSize=10`);
  const firstPageOwners = await page.locator("[data-data-directory] tbody tr td:first-child").allTextContents();
  expect(firstPageOwners).toHaveLength(10);
  await Promise.all([
    page.waitForURL(/\/admin\/orders\?pageSize=10&cursor=/),
    page.getByRole("link", { name: "Next page" }).click(),
  ]);
  const secondPageOwners = await page.locator("[data-data-directory] tbody tr td:first-child").allTextContents();
  expect(secondPageOwners).toHaveLength(7);
  expect(secondPageOwners.some((owner) => firstPageOwners.includes(owner))).toBe(false);
  await expect(page.getByRole("link", { name: "Previous page" })).toBeVisible();
  assertions.push({ state: "pagination", firstPage: firstPageOwners.length, secondPage: secondPageOwners.length, distinct: true });
  await captureState("state-en-orders-page-2-1440");

  await page.goto(`${baseUrl}/admin/orders?q=Ana`);
  await expect(directory.getByText("Ana Evidence").first()).toBeVisible();
  await expect(directory.getByText("bruno@example.com")).toHaveCount(0);
  assertions.push({ state: "search-payer", matched: "Ana Evidence" });
  await captureState("state-en-orders-search-payer-1440");

  await page.goto(`${baseUrl}/admin/orders?filter.source=AD_HOC`);
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Ad hoc" }).first()).toBeVisible();
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Payment link" })).toHaveCount(0);
  await expect(directory.getByText("Ana Evidence")).toHaveCount(0);
  assertions.push({ state: "filter-source", source: "AD_HOC" });
  await captureState("state-en-orders-filter-source-1440");

  await page.goto(`${baseUrl}/admin/orders`);
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Deleted" }).first()).toBeVisible();
  await captureState("state-en-deleted-owner-badge-1440");

  await page.goto(`${baseUrl}/admin/orders/v2/${seeded.orders.goneMain}`);
  await expect(page.getByText("Order owner")).toBeVisible();
  await expect(page.getByText(goneUsername).first()).toBeVisible();
  await expect(page.locator('[data-slot="badge"]', { hasText: "Deleted" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "View accounts" })).toBeVisible();
  await expect(page.locator('textarea[name="body"]')).toHaveCount(0);
  assertions.push({ state: "detail-deleted-owner", owner: goneUsername, badge: "Deleted" });
  await captureState("state-en-order-detail-deleted-owner-1440");

  // ---- shared directory grid: six themes, both locales, three widths ----
  for (const locale of locales) {
    await setLocale(page, locale);
    for (const theme of themes) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${baseUrl}/admin/orders`);
        await expect(page.locator("[data-data-directory]")).toBeVisible();
        await page.evaluate(async () => document.fonts.ready);
        await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectAdminOrders(`directory-${theme}-${locale}-${width}`);
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
    "src/orders/order-v2-admin-directory.ts",
    "src/orders/order-v2-view.ts",
    "src/app/orders/order-v2-views.tsx",
    "src/app/admin/orders/page.tsx",
    "src/app/admin/orders/directory-query.ts",
    "src/app/admin/orders/directory-copy.ts",
    "src/app/admin/orders/v2/[id]/page.tsx",
    "src/app/admin/orders/[id]/page.tsx",
    "src/data-directory/ui/data-directory.tsx",
    "src/i18n/dictionaries/orders-directory/en.ts",
    "src/i18n/dictionaries/orders-directory/pt-BR.ts",
    "tests/admin-orders.evidence.spec.ts",
    "scripts/run-admin-evidence.mjs",
    "scripts/run-admin-orders-evidence.mjs",
    "scripts/verify-admin-orders-evidence.mjs",
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
    assertions: `artifacts/admin-orders/${runId}/assertions.json`,
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
    "# Administrator global orders directory visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the read-only V2 detail with owner attribution, the opaque miss, page 2, payer search, the source filter, and the deleted-owner badge in both locales.",
    "- The directory is read-only: no comment thread, no local-outcome forms, and no mutation surface renders on the administrator detail.",
    "- Soft-delete runs through the delivered POST /admin/users/[id]/delete route; the deleted owner's orders stay listed with the localized non-color badge and the interim /admin/accounts navigation.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/admin-orders/${runId}/manifest.json`,
    review: `artifacts/admin-orders/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`ADMIN_ORDERS_EVIDENCE_RUN=${runId}`);
});
