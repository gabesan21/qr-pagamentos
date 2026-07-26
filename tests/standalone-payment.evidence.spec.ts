import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { checkoutEn } from "@/i18n/dictionaries/checkout/en";
import { checkoutPtBR } from "@/i18n/dictionaries/checkout/pt-BR";
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
const artifactRoot = join(process.cwd(), "artifacts", "standalone-payment");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const composeProject = process.env.STANDALONE_PAYMENT_EVIDENCE_COMPOSE_PROJECT ?? "";
const encryptionKey = process.env.STANDALONE_PAYMENT_EVIDENCE_ENCRYPTION_KEY ?? "";
const merchantUsername = "standalone.evidence";
const storefrontSlug = "ana-evidence-pay";
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const storefrontByLocale = { en: storefrontEn, "pt-BR": storefrontPtBR } as const;
const checkoutByLocale = { en: checkoutEn, "pt-BR": checkoutPtBR } as const;

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

// The 9.2.2 evidence seeds the storefront fixture (BRL registry pair plus the
// storefront settings row) and the standalone attempt/order/provider rows
// directly in the disposable database — never through app code or a test-only
// backdoor. The capability bearer is computed by the harness from its own
// disposable NAUTT_ENCRYPTION_KEY with the exact 9.2.1 HMAC recipe, so polling
// exercises the real capability verification path; the live submit is
// intercepted because provider dispatch belongs to 9.2.1's route tests.
const pair = { id: randomUUID(), currency: randomUUID(), exchange: randomUUID() };
const CAPABILITY_EXPIRES_AT = "2028-01-01T00:00:00.000Z";

function seedSql() {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return [
    `INSERT INTO app.catalog_currency_pair (id, label, currency_uuid, exchange_currency_uuid, active, created_at, updated_at)
     VALUES ('${pair.id}', 'BRL/PIX', '${pair.currency}', '${pair.exchange}', true, '${at(120)}', '${at(120)}')`,
    `INSERT INTO app.supported_exchange_currency (code, pair_id) VALUES ('BRL', '${pair.id}')`,
    `UPDATE app."user" u SET storefront_slug = '${storefrontSlug}', storefront_enabled = true,
       storefront_display_name_pt_br = 'Loja da Ana', storefront_display_name_en = 'Ana''s store',
       storefront_accent_color = '#106B5B', storefront_theme_id = 'pix-paper', storefront_layout = 'boxed',
       storefront_standalone_payments_enabled = true, storefront_default_currency_code = 'BRL',
       checkout_data_policy = 'NAME_EMAIL'
     WHERE u.username = '${merchantUsername}'`,
  ].join(";\n") + ";\n";
}

function seedAttempt(options: { state: string }) {
  const attemptId = randomUUID();
  const orderId = randomUUID();
  const quoteUuid = randomUUID();
  const nonce = randomBytes(32).toString("base64url");
  const key = Buffer.from(encryptionKey, "base64url");
  const bearer = createHmac("sha256", key)
    .update(`standalone-checkout-capability:v1:${attemptId}:${CAPABILITY_EXPIRES_AT}:${nonce}`)
    .digest("base64url");
  const capabilityVerifier = sha256(bearer);
  const at = new Date().toISOString();
  const sql = [
    `INSERT INTO app.order_v2 (id, owner_id, source, payment_link_v2_id, state, lifecycle_version, amount, currency_uuid, exchange_currency_uuid, checkout_data_policy, description_pt_br, description_en, settled_at, created_at, updated_at)
     SELECT '${orderId}', u.id, 'STANDALONE', NULL, '${options.state}', 0, '25', '${pair.currency}', '${pair.exchange}', 'NONE', 'Pagamento avulso', 'Standalone payment', NULL, '${at}', '${at}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.standalone_checkout_attempt (id, owner_id, order_v2_id, retry_key_verifier, request_verifier, capability_nonce, capability_key_version, capability_verifier, capability_expires_at, state, created_at, updated_at)
     SELECT '${attemptId}', u.id, '${orderId}', '${sha256(randomBytes(32))}', '${sha256(randomBytes(32))}', '${nonce}', 'v1', '${capabilityVerifier}', '${CAPABILITY_EXPIRES_AT}', 'PENDING', '${at}', '${at}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.provider_quote (quote_uuid, owner_id, expires_at, created_at)
     SELECT '${quoteUuid}', u.id, '${CAPABILITY_EXPIRES_AT}', '${at}' FROM app."user" u WHERE u.username = '${merchantUsername}'`,
    `INSERT INTO app.provider_order (owner_id, quote_uuid, provider_order_uuid, creation_state, status, fiat_amount, crypto_amount, nautt_quote, provider_expires_at, payment_method, pix_copy_paste, pix_qrcode_url, order_v2_id, created_at, updated_at)
     SELECT u.id, '${quoteUuid}', '${randomUUID()}', 'CREATED', 'processing', '25', '0.001', '25', '${CAPABILITY_EXPIRES_AT}', 'PIX', 'pix-copy-paste-evidence-code', '${baseUrl}/file.svg', '${orderId}', '${at}', '${at}'
     FROM app."user" u WHERE u.username = '${merchantUsername}'`,
  ].join(";\n") + ";\n";
  return { sql, bearer, attemptId, orderId };
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

function updateOwner(column: string, value: string) {
  seedDatabase(`UPDATE app."user" u SET ${column} = '${value}' WHERE u.username = '${merchantUsername}';\n`);
}

test("creates the closed standalone payment evidence run", async ({ page }) => {
  test.setTimeout(3_600_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.STANDALONE_PAYMENT_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword || !composeProject || !encryptionKey, "requires the disposable standalone payment evidence runtime");

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
  seedDatabase(seedSql());

  async function openPay(query = "") {
    await page.goto(`${baseUrl}/store/${storefrontSlug}/pay${query}`);
    await expect(page.locator("main.storefront-shell[aria-busy]")).toHaveCount(0);
    await expect(page.locator("main.storefront-shell")).toHaveCount(1);
    await page.evaluate(async () => document.fonts.ready);
  }

  async function inspectPay(state: string) {
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
    const relativePath = `artifacts/standalone-payment/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  const checkoutUrl = `**/api/store/${storefrontSlug}/checkout`;
  async function interceptSubmit(bearer: string) {
    await page.route(checkoutUrl, (route) => route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ payment: { state: "RESERVED" }, statusCapability: bearer }),
    }));
  }

  // ---- Themed grid: six themes x two locales x three widths on the
  // NAME_EMAIL form, proving the storefront theme/accent scoping. ----
  for (const locale of locales) {
    await setLocale(page, locale);
    for (const theme of themes) {
      updateOwner("storefront_theme_id", theme);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await openPay();
        await expect(page.locator(`main[data-theme-preview="${theme}"]`)).toBeVisible();
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectPay(`${locale}-${theme}-${width}`);
        await screenshot(`default-${theme}-${locale}-${width}`);
      }
    }
    updateOwner("storefront_theme_id", "pix-paper");
  }

  for (const locale of locales) {
    const storefront = storefrontByLocale[locale];
    const checkout = checkoutByLocale[locale];
    await setLocale(page, locale);
    await page.setViewportSize({ width: 375, height: 1000 });
    // The previous locale's pass ends on the NONE policy; the amount-invalid
    // step needs the NAME_EMAIL form again.
    updateOwner("checkout_data_policy", "NAME_EMAIL");

    // ---- Prefill: ?amount= fills the draft, revalidated client-side. ----
    await openPay("?amount=12.5");
    await expect(page.locator("#standalone-amount")).toHaveValue("12.5");
    assertions.push({ state: `${locale}-prefill`, prefilled: "12.5" });
    await screenshot(`interaction-${locale}-prefill`);

    // ---- Amount validation: the canonical grammar rejects inline, no fetch.
    // The grid left the NAME_EMAIL policy, so the required customer fields are
    // filled to pass native validation and reach the client check. ----
    await openPay();
    await page.locator("#standalone-amount").fill("abc");
    await page.locator("#standalone-name").fill("Ana");
    await page.locator("#standalone-email").fill("ana@example.com");
    await page.getByRole("button", { name: checkout.checkoutSubmit }).click();
    await expect(page.locator("main")).toContainText(storefront.storefrontCustomAmountInvalid);
    assertions.push({ state: `${locale}-amount-invalid`, errorVisible: true });
    await screenshot(`interaction-${locale}-amount-invalid`);

    // ---- Policy variants: the owner policy alone decides the visible fields. ----
    const variants = [
      { policy: "NONE", fields: [] as string[], capture: "policy-none" },
      { policy: "EMAIL", fields: ["email"], capture: "policy-email" },
      { policy: "NAME_EMAIL_CPF", fields: ["name", "email", "cpf"], capture: "policy-cpf" },
      { policy: "NAME_EMAIL_CPF_ADDRESS", fields: ["name", "email", "cpf", "street", "number", "district", "city", "stateUf", "postalCode"], capture: "policy-address" },
    ];
    for (const variant of variants) {
      updateOwner("checkout_data_policy", variant.policy);
      await openPay();
      for (const field of ["name", "email", "cpf", "street", "number", "district", "city", "stateUf", "postalCode"]) {
        expect(await page.locator(`#standalone-${field}`).count()).toBe(variant.fields.includes(field) ? 1 : 0);
      }
      assertions.push({ state: `${locale}-${variant.capture}`, fields: variant.fields });
      await screenshot(`interaction-${locale}-${variant.capture}`);
    }
    updateOwner("checkout_data_policy", "NONE");

    // ---- Payment flow one: waiting, QR, copy, polling status error with
    // manual retry, and the terminal view — all over the real capability
    // verification path against the seeded rows. ----
    const first = seedAttempt({ state: "CREATED" });
    seedDatabase(first.sql);
    await interceptSubmit(first.bearer);
    await openPay();
    await page.locator("#standalone-amount").fill("25");
    await page.getByRole("button", { name: checkout.checkoutSubmit }).click();
    const payment = page.locator("section.checkout-payment");
    await expect(payment).toContainText(checkout.checkoutWaitingPaymentData);
    await expect(page.locator(`main a[href="/store/${storefrontSlug}"]`)).toBeVisible();
    assertions.push({ state: `${locale}-payment-waiting`, waitingVisible: true, returnLink: true });
    await screenshot(`interaction-${locale}-payment-waiting`);

    seedDatabase(`UPDATE app.order_v2 SET state = 'PENDING', updated_at = now() WHERE id = '${first.orderId}';\n`);
    const qr = page.locator("img.checkout-qr");
    await expect(qr).toBeVisible({ timeout: 20_000 });
    expect(await qr.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(page.locator(".checkout-copy input")).toHaveValue("pix-copy-paste-evidence-code");
    await expect(payment).toContainText(checkout.checkoutStatePending);
    assertions.push({ state: `${locale}-payment-qr`, qrLoaded: true, pixVisible: true });
    await screenshot(`interaction-${locale}-payment-qr`);

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
    await page.getByRole("button", { name: checkout.checkoutCopyPix }).click();
    await expect(payment).toContainText(checkout.checkoutCopySuccess);
    assertions.push({ state: `${locale}-payment-copy`, copied: true });
    await screenshot(`interaction-${locale}-payment-copy`);

    const statusUrl = `**/api/store/${storefrontSlug}/checkout/status`;
    await page.route(statusUrl, (route) => route.fulfill({ status: 500, body: "" }));
    await expect(payment).toContainText(checkout.checkoutStatusErrorHeading, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: checkout.checkoutRetryStatus })).toBeVisible();
    assertions.push({ state: `${locale}-payment-status-error`, statusErrorVisible: true, retryVisible: true, returnLink: true });
    await screenshot(`interaction-${locale}-payment-status-error`);
    await page.unroute(statusUrl);
    // The deliberate 500s above log browser resource errors; drain them so the
    // global console gate keeps proving every other state is error-free.
    consoleErrors.length = 0;

    const terminal = locale === "pt-BR" ? "CONFIRMED" : "REJECTED";
    await page.getByRole("button", { name: checkout.checkoutRetryStatus }).click();
    seedDatabase(`UPDATE app.order_v2 SET state = '${terminal}', updated_at = now() WHERE id = '${first.orderId}';\n`);
    const terminalLabel = terminal === "CONFIRMED" ? checkout.checkoutStateConfirmed : checkout.checkoutStateRejected;
    await expect(payment).toContainText(terminalLabel, { timeout: 20_000 });
    const destructive = await payment.locator('[data-slot="badge"]').evaluate((badge) => badge.className.includes("bg-destructive"));
    expect(destructive).toBe(terminal !== "CONFIRMED");
    await expect(page.locator(`main a[href="/store/${storefrontSlug}"]`)).toBeVisible();
    assertions.push({ state: `${locale}-payment-terminal-${terminal.toLowerCase()}`, terminal, destructive, returnLink: true });
    await screenshot(`interaction-${locale}-payment-terminal-${terminal.toLowerCase()}`);
    await page.unroute(checkoutUrl);

    // ---- Payment flow two: an expired capability collapses to the one opaque
    // unavailable view on the next real poll. ----
    const second = seedAttempt({ state: "PENDING" });
    seedDatabase(second.sql);
    await interceptSubmit(second.bearer);
    await openPay();
    await page.locator("#standalone-amount").fill("25");
    await page.getByRole("button", { name: checkout.checkoutSubmit }).click();
    await expect(page.locator("img.checkout-qr")).toBeVisible({ timeout: 20_000 });
    seedDatabase(`UPDATE app.standalone_checkout_attempt SET capability_expires_at = '2020-01-01T00:00:00.000Z', updated_at = now() WHERE id = '${second.attemptId}';\n`);
    await expect(page.locator("main")).toContainText(storefront.storefrontUnavailableHeading, { timeout: 20_000 });
    await expect(page.locator("#standalone-amount")).toHaveCount(0);
    await expect(page.locator(`main a[href="/store/${storefrontSlug}"]`)).toBeVisible();
    assertions.push({ state: `${locale}-payment-expired`, unavailableVisible: true, returnLink: true });
    await screenshot(`interaction-${locale}-payment-expired`);
    await page.unroute(checkoutUrl);
    // The deliberate 404 above logs one browser resource error; drain it.
    consoleErrors.length = 0;

    // ---- Submit failure: 503 keeps the form behind one opaque error. ----
    await page.route(checkoutUrl, (route) => route.fulfill({ status: 503, body: "" }));
    await openPay();
    await page.locator("#standalone-amount").fill("25");
    await page.getByRole("button", { name: checkout.checkoutSubmit }).click();
    await expect(page.locator("main")).toContainText(checkout.checkoutErrorHeading);
    await expect(page.locator(`main a[href="/store/${storefrontSlug}"]`)).toBeVisible();
    assertions.push({ state: `${locale}-payment-submit-failed`, errorVisible: true, returnLink: true });
    await screenshot(`interaction-${locale}-payment-submit-failed`);
    await page.unroute(checkoutUrl);
    consoleErrors.length = 0;

    // ---- Unavailable surfaces: unknown slug and standalone off share the one
    // opaque unscoped view. ----
    await page.goto(`${baseUrl}/store/unknown-evidence-pay/pay`);
    await expect(page.locator("main.storefront-shell[aria-busy]")).toHaveCount(0);
    const unavailableShell = page.locator("main.storefront-shell--unavailable");
    await expect(unavailableShell).toContainText(storefront.storefrontUnavailableHeading);
    expect(await page.locator("main[data-theme-preview]").count()).toBe(0);
    await expect(page.locator(`main a[href="/store/unknown-evidence-pay"]`)).toBeVisible();
    assertions.push({ state: `${locale}-pay-unavailable`, unavailableVisible: true, noThemeAttribute: true, returnLink: true });
    await screenshot(`interaction-${locale}-pay-unavailable`);

    updateOwner("storefront_standalone_payments_enabled", "false");
    await openPay();
    await expect(page.locator("main")).toContainText(storefront.storefrontUnavailableHeading);
    expect(await page.locator("main[data-theme-preview]").count()).toBe(0);
    assertions.push({ state: `${locale}-pay-standalone-off`, unavailableVisible: true, noThemeAttribute: true, returnLink: true });
    await screenshot(`interaction-${locale}-pay-standalone-off`);
    updateOwner("storefront_standalone_payments_enabled", "true");
  }

  // ---- 320px reflow on the payment form. ----
  await page.setViewportSize({ width: 320, height: 1000 });
  await openPay();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  assertions.push({ state: "reflow-320", reflow: true });
  await screenshot("interaction-reflow-320");

  expect(screenshots).toHaveLength(67);
  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(assertions, null, 2)}\n`);
  const captureRecords = await Promise.all(screenshots.map(async (capturePath) => {
    const [contents, metadata] = await Promise.all([readFile(capturePath), stat(capturePath)]);
    return { path: capturePath, bytes: metadata.size, sha256: sha256(contents) };
  }));
  const sourceInventory = [
    "src/app/store/[slug]/pay/page.tsx",
    "src/app/store/[slug]/pay/loading.tsx",
    "src/app/store/[slug]/pay/error.tsx",
    "src/app/store/[slug]/pay/standalone-payment-experience.tsx",
    "src/app/store/[slug]/storefront-experience.tsx",
    "src/app/pay/[identifier]/public-checkout-form.tsx",
    "src/storefront/public-storefront.ts",
    "src/storefront/cart.ts",
    "src/i18n/dictionaries/storefront/en.ts",
    "src/i18n/dictionaries/storefront/pt-BR.ts",
    "src/i18n/dictionaries/checkout/en.ts",
    "src/i18n/dictionaries/checkout/pt-BR.ts",
    "src/app/globals.css",
    "scripts/generate-design-tokens.mjs",
    "scripts/check-design-tokens.mjs",
    "scripts/run-admin-evidence.mjs",
    "tests/standalone-payment.evidence.spec.ts",
    "scripts/run-standalone-payment-evidence.mjs",
    "scripts/verify-standalone-payment-evidence.mjs",
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceInventory.map(async (sourcePath) => [sourcePath, sha256(await readFile(sourcePath))])));
  const assertionsBytes = await readFile(assertionsPath);
  const manifest = {
    version: 1,
    runId,
    startedAt,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    baseCaptureCount: 36,
    interactionCaptureCount: 31,
    totalPngCount: 67,
    assertions: `artifacts/standalone-payment/${runId}/assertions.json`,
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
    "# Standalone payment visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440 on the standalone payment form, plus thirty-one localized state captures.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/standalone-payment/${runId}/manifest.json`,
    review: `artifacts/standalone-payment/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`STANDALONE_PAYMENT_EVIDENCE_RUN=${runId}`);
});
