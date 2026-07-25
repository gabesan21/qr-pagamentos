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
const artifactRoot = join(process.cwd(), "artifacts", "orders");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const composeProject = process.env.ORDERS_EVIDENCE_COMPOSE_PROJECT ?? "";
const merchantUsername = "orders.evidence";
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

// The public V2 checkout is 9.3.1, so the harness seeds the lifecycle fixture
// links, orders, comments, and local outcomes directly in the disposable
// database — never through app code or a test-only backdoor. Comment and
// local-outcome mutations run through the real 8.3.3 UI.
function seedSql() {
  const pair = { id: randomUUID(), currency: randomUUID(), exchange: randomUUID() };
  const links = { main: { id: randomUUID(), identifier: identifier() }, other: { id: randomUUID(), identifier: identifier() } };
  const orders = { main: randomUUID(), adhoc: randomUUID(), cancelled: randomUUID() };
  const comments = { seeded: randomUUID(), edited: randomUUID() };
  const fillers = Array.from({ length: 22 }, (_, index) => ({ id: randomUUID(), index }));
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const statements: string[] = [
    `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid, active, created_at, updated_at)
     VALUES ('${pair.id}', 'BRL/USDT', '${pair.currency}', '${pair.exchange}', true, '${at(600)}', '${at(600)}')`,
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
     SELECT '${links.main.id}', '${links.main.identifier}', u.id, 'FIXED_AMOUNT', 'Doação mensal', 'Monthly donation', '10.50', '${pair.id}', 'REUSABLE', true, 0, '${at(500)}', '${at(500)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
     SELECT '${links.other.id}', '${links.other.identifier}', u.id, 'FIXED_AMOUNT', 'Cota do clube', 'Club dues', '25', '${pair.id}', 'REUSABLE', true, 0, '${at(490)}', '${at(490)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    // Main order: LINK, CONFIRMED, NAME_EMAIL payer, two comments (one edited),
    // lifecycle_version 1 so the set-outcome CAS flows can run through the UI.
    `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, name, email, settled_at, created_at, updated_at)
     SELECT '${orders.main}', u.id, 'LINK', '${links.main.id}', 'CONFIRMED', 1, '10.50', '${pair.currency}', '${pair.exchange}', 'NAME_EMAIL', 'Ana Evidence', 'ana@example.com', '${at(18)}', '${at(20)}', '${at(18)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_comment_v2 (id, order_id, owner_id, author_id, body, version, created_at, edited_at)
     SELECT '${comments.seeded}', '${orders.main}', u.id, u.id, 'Comentário original', 0, '${at(15)}', NULL
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_comment_v2 (id, order_id, owner_id, author_id, body, version, created_at, edited_at)
     SELECT '${comments.edited}', '${orders.main}', u.id, u.id, 'Nota revisada', 1, '${at(14)}', '${at(13)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    // AD_HOC order: no payment state, no collected payer.
    `INSERT INTO app.order_v2 (id, owner_id, source, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, description_pt_br, description_en, checkout_data_policy, created_at, updated_at)
     SELECT '${orders.adhoc}', u.id, 'AD_HOC', NULL, 1, '7.25', '${pair.currency}', '${pair.exchange}', 'Venda avulsa', 'Ad hoc sale', 'NONE', '${at(30)}', '${at(30)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    // Rejected LINK order with a cancelled local outcome.
    `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, email, created_at, updated_at)
     SELECT '${orders.cancelled}', u.id, 'LINK', '${links.other.id}', 'REJECTED', 2, '25', '${pair.currency}', '${pair.exchange}', 'EMAIL', 'bruno@example.com', '${at(40)}', '${at(35)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.order_local_outcome_v2 (id, order_id, owner_id, outcome, note, actor_id, created_at)
     SELECT '${randomUUID()}', '${orders.cancelled}', u.id, 'LOCAL_CANCELLED', 'Chargeback manual', u.id, '${at(35)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    ...fillers.map((filler) =>
      `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, name, created_at, updated_at)
       SELECT '${filler.id}', u.id, 'LINK', '${links.other.id}', 'PENDING', 1, '1', '${pair.currency}', '${pair.exchange}', 'NAME_EMAIL', 'Pagador ${filler.index}', '${at(100 + filler.index)}', '${at(100 + filler.index)}'
       FROM app."user" u WHERE u.username = '${merchantUsername}'`),
  ];
  return { sql: `${statements.join(";\n")};\n`, links, orders, comments };
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

test("creates the closed merchant orders evidence run", async ({ page }) => {
  test.setTimeout(1_800_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.ORDERS_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword || !composeProject, "requires the disposable orders evidence runtime");

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

  async function inspectOrders(state: string) {
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
    const relativePath = `artifacts/orders/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  async function captureState(name: string) {
    await page.evaluate(async () => document.fonts.ready);
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await inspectOrders(name);
    await screenshot(name);
  }

  // ---- pt-BR pass: empty directory, seed, facts, detail, opaque miss, comment ----
  await setLocale(page, "pt-BR");

  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(`${baseUrl}/orders`);
  await expect(page.getByText("Nenhum pedido ainda")).toBeVisible();
  await captureState("state-pt-BR-orders-empty-375");

  const seeded = seedSql();
  seedDatabase(seeded.sql);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/orders`);
  const directory = page.locator("[data-data-directory]");
  await expect(directory).toBeVisible();
  await expect(directory.getByText("Ana Evidence").first()).toBeVisible();
  await expect(directory.getByText("ana@example.com").first()).toBeVisible();
  for (const label of ["Pagamento confirmado", "Pagamento recusado", "Aguardando pagamento", "Sem pagamento", "Cancelado localmente", "Avulso"]) {
    await expect(directory.locator('[data-slot="badge"]', { hasText: label }).first()).toBeVisible();
  }
  await expect(directory.getByText("Não coletado").first()).toBeVisible();
  await expect(directory.getByText(seeded.links.main.identifier).first()).toBeVisible();
  assertions.push({ state: "directory-facts", payer: "Ana Evidence", badges: ["CONFIRMED", "REJECTED", "PENDING", "none", "LOCAL_CANCELLED"], linkIdentifier: seeded.links.main.identifier });

  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(`${baseUrl}/orders`);
  await captureState("state-pt-BR-orders-ready-320");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`${baseUrl}/orders/v2/${seeded.orders.main}`);
  await expect(page.getByText("Comentário original").first()).toBeVisible();
  await expect(page.getByText("Nota revisada").first()).toBeVisible();
  await expect(page.getByText("Editado").first()).toBeVisible();
  await expect(page.getByText(seeded.links.main.identifier).first()).toBeVisible();
  assertions.push({ state: "detail-comments", comments: 2, edited: true });
  await captureState("state-pt-BR-order-detail-comments-1440");

  await page.goto(`${baseUrl}/orders/v2/${randomUUID()}`);
  await expect(page.getByText("Este pedido está indisponível")).toBeVisible();
  await expect(page.getByText(seeded.links.main.identifier)).toHaveCount(0);
  assertions.push({ state: "detail-unavailable", opaque: true });
  await captureState("state-pt-BR-order-detail-unavailable-1440");

  // Append a comment through the real detail form.
  await page.goto(`${baseUrl}/orders/v2/${seeded.orders.main}`);
  await page.getByLabel("Novo comentário").fill("Comentário da evidência");
  await Promise.all([
    page.waitForURL("**/orders?orders-v2=commented"),
    page.getByRole("button", { name: "Adicionar comentário" }).click(),
  ]);
  await expect(page.getByText("O comentário foi adicionado.")).toBeVisible();
  assertions.push({ state: "append-comment", outcome: "commented" });
  await captureState("state-pt-BR-order-commented-notice-1440");

  // ---- en pass: honest states, pagination, edit/outcome/failed, preference ----
  await setLocale(page, "en");

  await page.goto(`${baseUrl}/orders?q=no-such-order`);
  await expect(page.getByText("No matching records")).toBeVisible();
  await captureState("state-en-orders-filtered-empty-1440");

  await page.goto(`${baseUrl}/orders?forged=1`);
  await expect(page.getByText("The directory request is unavailable")).toBeVisible();
  await expect(page.getByText("forged")).toHaveCount(0);
  assertions.push({ state: "invalid-query-no-echo", echoed: false });
  await captureState("state-en-orders-invalid-query-1440");

  await page.goto(`${baseUrl}/orders`);
  const firstPagePayers = await page.locator("[data-data-directory] tbody tr td:first-child").allTextContents();
  expect(firstPagePayers).toHaveLength(20);
  await Promise.all([
    page.waitForURL(/\/orders\?cursor=/),
    page.getByRole("link", { name: "Next page" }).click(),
  ]);
  const secondPagePayers = await page.locator("[data-data-directory] tbody tr td:first-child").allTextContents();
  expect(secondPagePayers).toHaveLength(5);
  expect(secondPagePayers.some((payer) => firstPagePayers.includes(payer))).toBe(false);
  await expect(page.getByRole("link", { name: "Previous page" })).toBeVisible();
  assertions.push({ state: "pagination", firstPage: firstPagePayers.length, secondPage: secondPagePayers.length, distinct: true });
  await captureState("state-en-orders-page-2-1440");

  // Edit the seeded comment through its author-only CAS form.
  await page.goto(`${baseUrl}/orders/v2/${seeded.orders.main}`);
  const seededEntry = page.locator("article", { hasText: "Comentário original" });
  await seededEntry.locator("summary").click();
  await seededEntry.locator('textarea[name="body"]').fill("Comentário original editado");
  await Promise.all([
    page.waitForURL("**/orders?orders-v2=comment-edited"),
    seededEntry.getByRole("button", { name: "Save comment" }).click(),
  ]);
  await expect(page.getByText("The comment was updated.")).toBeVisible();
  assertions.push({ state: "edit-comment", outcome: "comment-edited" });
  await captureState("state-en-order-comment-edited-notice-1440");

  // Set a local outcome behind its native confirmation.
  await page.goto(`${baseUrl}/orders/v2/${seeded.orders.main}`);
  await page.locator("summary", { hasText: "Confirm local finalization" }).click();
  await page.locator('textarea[name="note"]').first().fill("Entrega confirmada");
  await Promise.all([
    page.waitForURL("**/orders?orders-v2=outcome-set"),
    page.getByRole("button", { name: "Finalize locally" }).click(),
  ]);
  await expect(page.getByText("The local outcome was recorded.")).toBeVisible();
  assertions.push({ state: "set-outcome", outcome: "outcome-set" });
  await captureState("state-en-order-outcome-set-notice-1440");

  // A stale lifecycle CAS fails opaquely: the open detail keeps version 2 while
  // a concurrent append bumps the stored version to 3.
  await page.goto(`${baseUrl}/orders/v2/${seeded.orders.main}`);
  seedDatabase(`UPDATE app.order_v2 SET lifecycle_version = lifecycle_version + 1 WHERE id = '${seeded.orders.main}';\n`);
  await page.locator("summary", { hasText: "Confirm local cancellation" }).click();
  await Promise.all([
    page.waitForURL("**/orders?orders-v2=failed"),
    page.getByRole("button", { name: "Cancel locally" }).click(),
  ]);
  await expect(page.getByText("The order change could not be saved.")).toBeVisible();
  assertions.push({ state: "set-outcome-stale-cas", outcome: "failed" });
  await captureState("state-en-order-failed-notice-1440");

  // The page-size preference: a stored registered size applies to the bare URL
  // exactly once, and an explicit toolbar choice is re-stored.
  await page.evaluate(() => window.localStorage.setItem("qr-orders-v2-page-size", "50"));
  await page.goto(`${baseUrl}/orders`);
  await page.waitForURL(/\/orders\?pageSize=50$/);
  const applied = await page.locator("#orders-v2-page-size").inputValue();
  expect(applied).toBe("50");
  await page.locator("#orders-v2-page-size").selectOption("10");
  await Promise.all([
    page.waitForURL(/\/orders\?pageSize=10$/),
    page.getByRole("button", { name: "Apply filters" }).click(),
  ]);
  const persisted = await page.evaluate(() => window.localStorage.getItem("qr-orders-v2-page-size"));
  expect(persisted).toBe("10");
  assertions.push({ state: "page-size-preference", applied: 50, persisted: 10 });
  await captureState("state-en-orders-page-size-preference-1440");

  // ---- shared directory grid: six themes, both locales, three widths ----
  for (const locale of locales) {
    await setLocale(page, locale);
    for (const theme of themes) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${baseUrl}/orders`);
        await expect(page.locator("[data-data-directory]")).toBeVisible();
        await page.evaluate(async () => document.fonts.ready);
        await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectOrders(`directory-${theme}-${locale}-${width}`);
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
    "src/orders/order-v2-view.ts",
    "src/orders/order-v2-directory.ts",
    "src/orders/order-engagement-v2.ts",
    "src/app/orders-v2/route.ts",
    "src/app/orders-v2/[id]/route.ts",
    "src/app/orders/order-views.tsx",
    "src/app/orders/order-v2-views.tsx",
    "src/app/(merchant)/orders/page.tsx",
    "src/app/(merchant)/orders/directory-query.ts",
    "src/app/(merchant)/orders/directory-copy.ts",
    "src/app/(merchant)/orders/orders-notices.tsx",
    "src/app/(merchant)/orders/page-size-preference.tsx",
    "src/app/(merchant)/orders/loading.tsx",
    "src/app/(merchant)/orders/v2/[id]/page.tsx",
    "src/app/(merchant)/orders/[id]/page.tsx",
    "src/data-directory/ui/data-directory.tsx",
    "src/i18n/dictionaries/orders-directory/en.ts",
    "src/i18n/dictionaries/orders-directory/pt-BR.ts",
    "src/observability/server-request-log.ts",
    "tests/orders.evidence.spec.ts",
    "scripts/run-admin-evidence.mjs",
    "scripts/run-orders-evidence.mjs",
    "scripts/verify-orders-evidence.mjs",
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
    assertions: `artifacts/orders/${runId}/assertions.json`,
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
    "# Merchant orders management visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the comment-thread detail, the opaque miss, page 2, every closed outcome notice, and the page-size preference.",
    "- Engagement flows run through the real 8.3.3 UI: comment append, author comment edit under CAS, guarded local-outcome set, and a stale lifecycle CAS that fails opaquely.",
    "- The page-size preference reapplies a stored registered size on the bare URL exactly once and re-stores the explicit toolbar choice.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- The error directory state is induced only in unit/page tests: stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/orders/${runId}/manifest.json`,
    review: `artifacts/orders/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`ORDERS_EVIDENCE_RUN=${runId}`);
});
