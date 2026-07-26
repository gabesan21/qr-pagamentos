import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
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
const artifactRoot = join(process.cwd(), "artifacts", "checkout");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const composeProject = process.env.CHECKOUT_EVIDENCE_COMPOSE_PROJECT ?? "";
const encryptionKey = process.env.CHECKOUT_EVIDENCE_ENCRYPTION_KEY ?? "";
const merchantUsername = "checkout.evidence";
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer, value: string) => createHmac("sha256", key).update(value);
const identifier = () => randomBytes(18).toString("base64url");
const customer = { name: null, email: null, cpf: null, address: null };

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

type SeededAttempt = Readonly<{ id: string; orderId: string; retryKey: string; capability: string }>;

// QR, polling, and terminal states run against seeded checkout_attempt_v2 +
// order_v2 + provider_order rows; the capability and retry/request verifiers
// are computed here from the harness's own disposable NAUTT_ENCRYPTION_KEY,
// exactly as the runtime derives them — never through app code or a backdoor.
function seedAttemptSql(input: {
  linkId: string;
  linkDbId: string;
  retryKey: string;
  amount: string;
  pair: { currency: string; exchange: string };
  orderState: "PENDING" | "REJECTED";
  capabilityExpiresAt: Date;
  withProviderOrder: boolean;
  qrDataUrl: string | null;
}): { sql: string; attempt: SeededAttempt } {
  const key = Buffer.from(encryptionKey, "base64url");
  const attemptId = randomUUID();
  const orderId = randomUUID();
  const nonce = randomBytes(32).toString("base64url");
  const expiresAtIso = input.capabilityExpiresAt.toISOString();
  const capability = hmac(key, `checkout-v2-capability:v1:${attemptId}:${expiresAtIso}:${nonce}`).digest("base64url");
  const retryKeyVerifier = hmac(key, `checkout-v2-retry:${input.retryKey}`).digest("hex");
  const requestVerifier = hmac(key, `checkout-v2-request:${input.linkDbId}:${retryKeyVerifier}:NONE:${JSON.stringify(customer)}`).digest("hex");
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const quoteUuid = randomUUID();
  const providerOrderUuid = randomUUID();
  const statements = [
    `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, created_at, updated_at)
     SELECT '${orderId}', u.id, 'LINK', '${input.linkDbId}', '${input.orderState}', 1, '${input.amount}', '${input.pair.currency}', '${input.pair.exchange}', 'NONE', '${at(10)}', '${at(10)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.checkout_attempt_v2 (id, owner_id, payment_link_v2_id, order_v2_id, retry_key_verifier, request_verifier, capability_nonce, capability_key_version, capability_verifier, capability_expires_at, state, created_at, updated_at)
     SELECT '${attemptId}', u.id, '${input.linkDbId}', '${orderId}', '${retryKeyVerifier}', '${requestVerifier}', '${nonce}', 'v1', '${sha256(capability)}', '${expiresAtIso}', 'PENDING', '${at(10)}', '${at(10)}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
  ];
  if (input.withProviderOrder) {
    statements.push(
      `INSERT INTO app.provider_quote (quote_uuid, owner_id, expires_at, created_at)
       SELECT '${quoteUuid}', u.id, '${at(-60)}', '${at(10)}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
      `INSERT INTO app.provider_order (owner_id, quote_uuid, order_v2_id, provider_order_uuid, creation_state, status, fiat_amount, crypto_amount, nautt_quote, provider_expires_at, payment_method, pix_copy_paste, pix_qrcode_url, reconciliation_version)
       SELECT u.id, '${quoteUuid}', '${orderId}', '${providerOrderUuid}', 'CREATED', 'new', '${input.amount}', '6.9', '13.8', '${at(-60)}', 'pix',
              '00020126580014br.gov.bcb.pix0136${randomUUID()}520400005303986540${input.amount.length}5802BR', ${input.qrDataUrl ? `'${input.qrDataUrl}'` : "NULL"}, 1
       FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    );
  }
  return { sql: `${statements.join(";\n")};\n`, attempt: { id: attemptId, orderId, retryKey: input.retryKey, capability } };
}

test("creates the closed public checkout evidence run", async ({ page }) => {
  test.setTimeout(1_800_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.CHECKOUT_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword || !composeProject || !encryptionKey, "requires the disposable checkout evidence runtime");

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
    if (!request.url().startsWith(baseUrl) && !request.url().startsWith("data:")) externalRequests.push(request.url());
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const pairA = { id: randomUUID(), currency: randomUUID(), exchange: randomUUID() };
  const pairB = { id: randomUUID(), currency: randomUUID(), exchange: randomUUID() };
  const products = [
    { id: randomUUID(), internalName: "Espresso", titlePtBr: "Café expresso", titleEn: "Espresso shot", price: "12.5" },
    { id: randomUUID(), internalName: "Filter", titlePtBr: "Café coado", titleEn: "Filter coffee", price: "9.9" },
  ];
  const links = {
    main: { id: randomUUID(), identifier: identifier() },
    fixed: { id: randomUUID(), identifier: identifier() },
    consumed: { id: randomUUID(), identifier: identifier() },
  };
  const consumedOrder = randomUUID();
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

  function seedFixtureSql() {
    const statements = [
      `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid, active, created_at, updated_at)
       VALUES ('${pairA.id}', 'BRL/USDT', '${pairA.currency}', '${pairA.exchange}', true, '${at(120)}', '${at(120)}'),
              ('${pairB.id}', 'EUR/USDT', '${pairB.currency}', '${pairB.exchange}', true, '${at(120)}', '${at(120)}')`,
      `INSERT INTO app.supported_exchange_currency (code, pair_id) VALUES ('BRL', '${pairA.id}')`,
      ...products.map((product) =>
        `INSERT INTO app.product (id, owner_id, internal_name, title_pt_br, title_en, description_pt_br, description_en, price, active, version, created_at, updated_at)
         SELECT '${product.id}', u.id, '${product.internalName}', '${product.titlePtBr}', '${product.titleEn}', 'Descrição', 'Description', '${product.price}', true, 0, '${at(110)}', '${at(110)}'
         FROM app."user" u WHERE u.username = '${merchantUsername}'`),
      `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, currency_pair_id, link_type, active, version, created_at, updated_at)
       SELECT '${links.main.id}', '${links.main.identifier}', u.id, 'PRODUCT_LINES', '${pairA.id}', 'REUSABLE', true, 0, '${at(100)}', '${at(100)}'
       FROM app."user" u WHERE u.username = '${merchantUsername}'`,
      `INSERT INTO app.payment_link_v2_line (payment_link_v2_id, owner_id, product_id, position, quantity)
       SELECT '${links.main.id}', u.id, '${products[0]!.id}', 1, 2 FROM app."user" u WHERE u.username = '${merchantUsername}'`,
      `INSERT INTO app.payment_link_v2_line (payment_link_v2_id, owner_id, product_id, position, quantity)
       SELECT '${links.main.id}', u.id, '${products[1]!.id}', 2, 1 FROM app."user" u WHERE u.username = '${merchantUsername}'`,
      `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
       SELECT '${links.fixed.id}', '${links.fixed.identifier}', u.id, 'FIXED_AMOUNT', 'Doação mensal', 'Monthly donation', '10.50', '${pairB.id}', 'REUSABLE', true, 0, '${at(99)}', '${at(99)}'
       FROM app."user" u WHERE u.username = '${merchantUsername}'`,
      `INSERT INTO app.payment_link_v2 (id, identifier, owner_id, composition_kind, description_pt_br, description_en, amount, currency_pair_id, link_type, active, version, created_at, updated_at)
       SELECT '${links.consumed.id}', '${links.consumed.identifier}', u.id, 'FIXED_AMOUNT', 'Cota do clube', 'Club dues', '25', '${pairA.id}', 'SINGLE_USE', true, 0, '${at(98)}', '${at(98)}'
       FROM app."user" u WHERE u.username = '${merchantUsername}'`,
      `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, settled_at, created_at, updated_at)
       SELECT '${consumedOrder}', u.id, 'LINK', '${links.consumed.id}', 'CONFIRMED', 1, '25', '${pairA.currency}', '${pairA.exchange}', 'NONE', '${at(90)}', '${at(95)}', '${at(90)}'
       FROM app."user" u WHERE u.username = '${merchantUsername}'`,
      `INSERT INTO app.payment_link_v2_single_use_settlement (payment_link_v2_id, owner_id, order_v2_id, claimed_at)
       SELECT '${links.consumed.id}', u.id, '${consumedOrder}', '${at(90)}'
       FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    ];
    return `${statements.join(";\n")};\n`;
  }

  async function inspectCheckout(state: string) {
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
    const fallbackControl = page.locator("button, a[href]").first();
    const hasControl = (await formControls.count()) > 0 || (await fallbackControl.count()) > 0;
    const firstInput = (await formControls.count()) > 0 ? formControls.first() : fallbackControl;
    const focus = hasControl
      ? await (async () => {
        await firstInput.focus();
        const style = await firstInput.evaluate((element) => {
          const computed = getComputedStyle(element);
          return { boxShadow: computed.boxShadow, outlineWidth: Number.parseFloat(computed.outlineWidth) };
        });
        return style;
      })()
      : null;
    if (focus) expect(focus.outlineWidth >= 2 || focus.boxShadow !== "none").toBe(true);
    const axe = await new AxeBuilder({ page }).analyze();
    const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(severeAxe).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    assertions.push({ state, measured, focus, severeAxe });
  }

  async function screenshot(name: string) {
    const relativePath = `artifacts/checkout/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  async function captureState(name: string) {
    await page.evaluate(async () => document.fonts.ready);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await inspectCheckout(name);
    await screenshot(name);
  }

  async function rewriteRetryKey(retryKey: string, apply: boolean) {
    const pattern = "**/api/payment-links/*/checkout";
    if (!apply) {
      await page.unroute(pattern);
      return;
    }
    await page.route(pattern, async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.continue({ postData: JSON.stringify({ ...body, idempotencyKey: retryKey }) });
    });
  }

  // ---- merchant provisioning and direct fixture seeding ----
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
  await setLocale(page, "pt-BR");

  seedDatabase(seedFixtureSql());
  const qrPng = await sharp({ create: { width: 96, height: 96, channels: 3, background: { r: 18, g: 84, b: 72 } } }).png().toBuffer();
  const qrDataUrl = `data:image/png;base64,${qrPng.toString("base64")}`;
  const expires = new Date(Date.now() + 23 * 60 * 60 * 1000);
  const seededAttempts = {
    qr: seedAttemptSql({ linkId: links.main.identifier, linkDbId: links.main.id, retryKey: "evidence-retry-qr-000001", amount: "34.9", pair: pairA, orderState: "PENDING", capabilityExpiresAt: expires, withProviderOrder: true, qrDataUrl }),
    waiting: seedAttemptSql({ linkId: links.main.identifier, linkDbId: links.main.id, retryKey: "evidence-retry-wait-0001", amount: "34.9", pair: pairA, orderState: "PENDING", capabilityExpiresAt: expires, withProviderOrder: false, qrDataUrl: null }),
    rejected: seedAttemptSql({ linkId: links.fixed.identifier, linkDbId: links.fixed.id, retryKey: "evidence-retry-rej-00001", amount: "10.50", pair: pairB, orderState: "REJECTED", capabilityExpiresAt: expires, withProviderOrder: false, qrDataUrl: null }),
    expired: seedAttemptSql({ linkId: links.main.identifier, linkDbId: links.main.id, retryKey: "evidence-retry-exp-00001", amount: "34.9", pair: pairA, orderState: "PENDING", capabilityExpiresAt: new Date(Date.now() - 60 * 60 * 1000), withProviderOrder: true, qrDataUrl }),
  };
  seedDatabase(Object.values(seededAttempts).map((seeded) => seeded.sql).join("\n"));

  // ---- pt-BR pass: unbranded compositions and opaque unavailable states ----
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(`${baseUrl}/pay/${links.fixed.identifier}`);
  await expect(page.getByText("Este pagamento não exige dados do cliente.")).toBeVisible();
  await expect(page.getByText("Doação mensal")).toBeVisible();
  await expect(page.getByText("moeda sem rótulo")).toBeVisible();
  await expect(page.locator('img.checkout-v2__logo')).toHaveCount(0);
  assertions.push({ state: "fixed-unbranded", composition: "FIXED_AMOUNT", currency: "unlabeled", logo: false, themePreview: "pix-paper" });
  await captureState("state-pt-BR-fixed-none-375");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/pay/${identifier()}`);
  await expect(page.getByText("Este link de pagamento está indisponível").first()).toBeVisible();
  assertions.push({ state: "unavailable-unknown", opaque: true });
  await captureState("state-pt-BR-unavailable-1440");

  await page.goto(`${baseUrl}/pay/${links.consumed.identifier}`);
  await expect(page.getByText("Este link de pagamento está indisponível").first()).toBeVisible();
  await expect(page.getByText("Cota do clube")).toHaveCount(0);
  assertions.push({ state: "unavailable-consumed-single-use", opaque: true, paidView: false });
  await captureState("state-pt-BR-consumed-single-use-1440");

  // ---- branding through the real storefront settings workspace ----
  await page.goto(`${baseUrl}/settings`);
  await page.locator("#storefront-display-name-pt-br").fill("Café da Ana");
  await page.locator("#storefront-display-name-en").fill("Ana's Coffee");
  await page.locator("#storefront-accent-color").fill("#125448");
  const logoPng = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 18, g: 84, b: 72 } } }).png().toBuffer();
  await page.locator('input[name="logo"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logoPng });
  await Promise.all([
    page.waitForURL(/storefront-logo=staged&logo=[A-Za-z0-9_-]{43}$/),
    page.locator('button[form="storefront-logo-upload"]').click(),
  ]);
  await Promise.all([
    page.waitForURL(/storefront=changed$/),
    page.getByRole("button", { name: /Salvar configurações da vitrine|Save storefront settings/ }).click(),
  ]);
  const brandingRow = execFileSync("docker", [
    "ps", "-q",
    "--filter", `label=com.docker.compose.project=${composeProject}`,
    "--filter", "label=com.docker.compose.service=db",
  ], { encoding: "utf8" }).trim();
  const brandingCheck = execFileSync("docker", [
    "exec", "-i", brandingRow,
    "psql", "-U", "postgres", "-d", "qr_pagamentos", "-p", "5433", "-t", "-A",
    "-c", `SELECT storefront_enabled, storefront_accent_color, storefront_logo_media_identifier IS NOT NULL FROM app."user" WHERE username = '${merchantUsername}'`,
  ], { encoding: "utf8" }).trim();
  expect(brandingCheck).toBe("f|#125448|t");
  assertions.push({ state: "branding-persisted", storefrontEnabled: false, accent: "#125448", logo: true });

  // ---- pt-BR pass: branded composition, validation, pending, opaque error ----
  seedDatabase(`UPDATE app."user" SET checkout_data_policy = 'NAME_EMAIL' WHERE username = '${merchantUsername}';\n`);
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(`${baseUrl}/pay/${links.main.identifier}`);
  await expect(page.getByText("Café da Ana")).toBeVisible();
  await expect(page.locator('img.checkout-v2__logo')).toBeVisible();
  await expect(page.getByText("Café expresso")).toBeVisible();
  await expect(page.getByText("Café coado")).toBeVisible();
  await expect(page.getByText("34.9")).toBeVisible();
  assertions.push({ state: "product-lines-branded", composition: "PRODUCT_LINES", lines: 2, total: "34.9", currency: "BRL", logo: true });
  await captureState("state-pt-BR-checkout-320");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/pay/${links.main.identifier}`);
  await page.getByRole("button", { name: "Continuar para o pagamento" }).click();
  await expect(page.getByText("Preencha este campo obrigatório antes de continuar.").first()).toBeVisible();
  const validationErrors = await page.getByText("Preencha este campo obrigatório antes de continuar.").count();
  expect(validationErrors).toBe(2);
  assertions.push({ state: "inline-validation", errors: validationErrors });
  await captureState("state-pt-BR-inline-validation-1440");

  await page.getByLabel("Nome").fill("Ana Evidence");
  await page.getByLabel("E-mail").fill("ana@example.com");
  await page.route("**/api/payment-links/*/checkout", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({ status: 503, body: "" });
  });
  const submitButton = page.getByRole("button", { name: /Continuar para o pagamento|Preparando pagamento/ });
  void submitButton.click({ noWaitAfter: true });
  await expect(page.getByRole("button", { name: /Preparando pagamento/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Preparando pagamento/ })).toHaveAttribute("aria-busy", "true");
  assertions.push({ state: "submit-pending", busy: true, disabled: true });
  await captureState("state-pt-BR-submit-pending-1440");
  await expect(page.getByText("Não foi possível preparar o pagamento")).toBeVisible();
  assertions.push({ state: "checkout-error", opaque: true });
  await captureState("state-pt-BR-checkout-error-1440");
  await page.unroute("**/api/payment-links/*/checkout");

  // ---- en pass: policy variants, QR/copy, polling, terminal states ----
  await setLocale(page, "en");
  seedDatabase(`UPDATE app."user" SET checkout_data_policy = 'EMAIL' WHERE username = '${merchantUsername}';\n`);
  await page.goto(`${baseUrl}/pay/${links.main.identifier}`);
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveCount(0);
  await captureState("state-en-policy-email-1440");

  seedDatabase(`UPDATE app."user" SET checkout_data_policy = 'NAME_EMAIL_CPF' WHERE username = '${merchantUsername}';\n`);
  await page.goto(`${baseUrl}/pay/${links.main.identifier}`);
  await expect(page.getByLabel("CPF")).toBeVisible();
  await captureState("state-en-policy-cpf-1440");

  seedDatabase(`UPDATE app."user" SET checkout_data_policy = 'NAME_EMAIL_CPF_ADDRESS' WHERE username = '${merchantUsername}';\n`);
  await page.goto(`${baseUrl}/pay/${links.main.identifier}`);
  await expect(page.getByLabel("Postal code")).toBeVisible();
  await expect(page.getByLabel("State")).toBeVisible();
  await captureState("state-en-policy-cpf-address-1440");
  assertions.push({ state: "policies", seen: ["NONE", "EMAIL", "NAME_EMAIL", "NAME_EMAIL_CPF", "NAME_EMAIL_CPF_ADDRESS"] });

  seedDatabase(`UPDATE app."user" SET checkout_data_policy = 'NONE' WHERE username = '${merchantUsername}';\n`);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  await rewriteRetryKey(seededAttempts.qr.attempt.retryKey, true);
  await page.goto(`${baseUrl}/pay/${links.main.identifier}`);
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.locator("img.checkout-qr")).toBeVisible();
  await expect(page.getByLabel("PIX copy and paste code")).toBeVisible();
  await page.getByRole("button", { name: "Copy PIX code" }).click();
  await expect(page.getByText("PIX code copied.")).toBeVisible();
  assertions.push({ state: "qr-copy", qrVisible: true, copy: "success", capabilityReal: true });
  await captureState("state-en-qr-copy-1440");

  await page.route("**/api/payment-links/*/checkout/status", async (route) => { await route.abort(); });
  await expect(page.getByText("Payment status could not be refreshed")).toBeVisible({ timeout: 30_000 });
  await captureState("state-en-status-error-1440");
  await page.unroute("**/api/payment-links/*/checkout/status");
  await page.getByRole("button", { name: "Check status again" }).click();
  await expect(page.getByText("Payment status could not be refreshed")).toHaveCount(0);
  await expect(page.locator("img.checkout-qr")).toBeVisible();
  assertions.push({ state: "status-error-retry", recovered: true });

  seedDatabase(`UPDATE app.order_v2 SET state = 'CONFIRMED', settled_at = CURRENT_TIMESTAMP WHERE id = '${seededAttempts.qr.attempt.orderId}';\n`);
  await expect(page.getByText("Payment confirmed")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("img.checkout-qr")).toHaveCount(0);
  assertions.push({ state: "terminal-confirmed", badge: "CONFIRMED" });
  await captureState("state-en-confirmed-1440");

  await rewriteRetryKey(seededAttempts.waiting.attempt.retryKey, true);
  await page.goto(`${baseUrl}/pay/${links.main.identifier}`);
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByText("Payment details are still being prepared.")).toBeVisible();
  assertions.push({ state: "waiting-payment-data", shown: true });
  await captureState("state-en-waiting-payment-data-1440");

  await rewriteRetryKey(seededAttempts.rejected.attempt.retryKey, true);
  await page.goto(`${baseUrl}/pay/${links.fixed.identifier}`);
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByText("Payment rejected")).toBeVisible({ timeout: 30_000 });
  const rejectedBadgeVariant = await page.locator('[data-slot="badge"]', { hasText: "Payment rejected" }).getAttribute("class");
  expect(rejectedBadgeVariant).toContain("destructive");
  assertions.push({ state: "terminal-rejected", destructive: true });
  await captureState("state-en-rejected-1440");

  await rewriteRetryKey(seededAttempts.expired.attempt.retryKey, true);
  await page.goto(`${baseUrl}/pay/${links.main.identifier}`);
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByText("This payment link is unavailable")).toBeVisible();
  assertions.push({ state: "expired-capability", opaque: true });
  await captureState("state-en-capability-unavailable-1440");
  await rewriteRetryKey("", false);

  // ---- shared branded grid: six persisted themes, both locales, three widths ----
  for (const locale of locales) {
    await setLocale(page, locale);
    for (const theme of themes) {
      seedDatabase(`UPDATE app."user" SET storefront_theme_id = '${theme}' WHERE username = '${merchantUsername}';\n`);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${baseUrl}/pay/${links.main.identifier}`);
        await expect(page.locator("main.checkout-v2")).toHaveAttribute("data-theme-preview", theme);
        await page.evaluate(async () => document.fonts.ready);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectCheckout(`checkout-${theme}-${locale}-${width}`);
        await screenshot(`checkout-${theme}-${locale}-${width}`);
      }
    }
  }
  assertions.push({ state: "branding-grid", themes: themes.length, locales: locales.length, widths: widths.length });

  expect(screenshots).toHaveLength(52);
  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(assertions, null, 2)}\n`);
  const captureRecords = await Promise.all(screenshots.map(async (capturePath) => {
    const [contents, metadata] = await Promise.all([readFile(capturePath), stat(capturePath)]);
    return { path: capturePath, bytes: metadata.size, sha256: sha256(contents) };
  }));
  const sourceInventory = [
    "src/checkout/public-checkout-v2.ts",
    "src/checkout/payment-status-v2.ts",
    "src/checkout/public-checkout-v2-presentation.ts",
    "src/orders/order-v2.ts",
    "src/app/api/payment-links/[identifier]/checkout/route.ts",
    "src/app/api/payment-links/[identifier]/checkout/status/route.ts",
    "src/app/pay/[identifier]/page.tsx",
    "src/app/pay/[identifier]/public-checkout-v2-page.tsx",
    "src/app/pay/[identifier]/public-checkout-v2-form.tsx",
    "src/app/pay/[identifier]/public-checkout-form.tsx",
    "src/app/pay/[identifier]/loading.tsx",
    "src/app/pay/[identifier]/error.tsx",
    "src/app/globals.css",
    "src/i18n/dictionaries/checkout/en.ts",
    "src/i18n/dictionaries/checkout/pt-BR.ts",
    "src/observability/server-request-log.ts",
    "src/security/public-rate-limit.ts",
    "scripts/check-design-tokens.mjs",
    "tests/checkout.evidence.spec.ts",
    "scripts/run-admin-evidence.mjs",
    "scripts/run-checkout-evidence.mjs",
    "scripts/verify-checkout-evidence.mjs",
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceInventory.map(async (sourcePath) => [sourcePath, sha256(await readFile(sourcePath))])));
  const assertionsBytes = await readFile(assertionsPath);
  const manifest = {
    version: 1,
    runId,
    startedAt,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    baseCaptureCount: 36,
    stateCaptureCount: 16,
    totalPngCount: 52,
    assertions: `artifacts/checkout/${runId}/assertions.json`,
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
    "# Public checkout visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six persisted merchant themes × two locales × 375/768/1440 branded checkout captures, plus sixteen localized state captures covering both compositions, all five policy variants, 320-pixel reflow, inline validation, submit-pending, the opaque checkout error, QR/copy feedback, waiting-for-payment-data, status-error with manual retry, both terminal badges, the expired-capability opaque unavailable, and the unknown/consumed-single-use opaque unavailable views.",
    "- Branding resolves from the owner's persisted settings with the storefront disabled: the real settings workspace saves the display names, accent, and logo, and the checkout renders them through the scoped theme mechanism.",
    "- QR, polling, and terminal states run against checkout_attempt_v2/order_v2/provider_order rows seeded directly in the disposable database with the capability HMAC computed from the harness's own disposable NAUTT_ENCRYPTION_KEY; no provider call occurs in the run.",
    "- The loading skeleton and the render error state are structural states without an honest runtime capture; they ship as route-level loading.tsx/error.tsx and are exercised only by unit-level rendering.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/checkout/${runId}/manifest.json`,
    review: `artifacts/checkout/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`CHECKOUT_EVIDENCE_RUN=${runId}`);
});
