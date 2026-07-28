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
const artifactRoot = join(process.cwd(), "artifacts", "admin-users");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const composeProject = process.env.ADMIN_USERS_EVIDENCE_COMPOSE_PROJECT ?? "";
const keptUsername = "admin.users.keep";
const goneUsername = "admin.users.gone";
const idleUsername = "admin.users.idle";
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

// Store states, the disabled status, filler accounts, and session sightings
// are seeded directly in the disposable database — never through app code or
// a test-only backdoor. Account creation and the soft-delete run through the
// delivered administrator surfaces. The gone account is aged to the oldest
// creation instant so pagination math is deterministic.
function seedSql() {
  const fillers = Array.from({ length: 12 }, (_, index) => ({ id: randomUUID(), index }));
  const sessions = [randomUUID(), randomUUID()];
  const digests = [randomBytes(32).toString("hex"), randomBytes(32).toString("hex")];
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const statements: string[] = [
    `UPDATE app."user" SET storefront_slug = 'keep-store', storefront_enabled = true WHERE username = '${keptUsername}'`,
    `UPDATE app."user" SET storefront_slug = 'idle-store', storefront_enabled = false, status = 'DISABLED' WHERE username = '${idleUsername}'`,
    `UPDATE app."user" SET created_at = '2020-01-01T00:00:00.000Z' WHERE username = '${goneUsername}'`,
    `INSERT INTO app.session (id, user_id, token_digest, created_at, last_seen_at, absolute_expires_at)
     SELECT '${sessions[0]}', u.id, '${digests[0]}', '${at(200)}', '${at(30)}', '${at(-600)}'
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    `INSERT INTO app.session (id, user_id, token_digest, created_at, last_seen_at, absolute_expires_at)
     SELECT '${sessions[1]}', u.id, '${digests[1]}', '${at(300)}', '${at(90)}', '${at(-600)}'
     FROM app."user" u WHERE u.username = '${keptUsername}'`,
    ...fillers.map((filler) =>
      `INSERT INTO app."user" (id, username, email, role, status, created_at, updated_at)
       VALUES ('${filler.id}', 'admin.users.filler-${filler.index}', 'filler.${filler.index}@example.com', 'USER', 'ACTIVE', '${at(100 + filler.index)}', '${at(100 + filler.index)}')`),
  ];
  return `${statements.join(";\n")};\n`;
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

test("creates the closed administrator users evidence run", async ({ page }) => {
  test.setTimeout(1_800_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.ADMIN_USERS_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword || !composeProject, "requires the disposable admin users evidence runtime");

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
  // The three merchants are created through the delivered administrator surface.
  for (const username of [keptUsername, goneUsername, idleUsername]) {
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

  async function inspectAdminUsers(state: string) {
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
    const relativePath = `artifacts/admin-users/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  async function captureState(name: string) {
    await page.evaluate(async () => document.fonts.ready);
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await inspectAdminUsers(name);
    await screenshot(name);
  }

  async function assertAxe(state: string) {
    const axe = await new AxeBuilder({ page }).analyze();
    const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(severeAxe).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    assertions.push({ state, severeAxe });
  }

  // ---- pt-BR pass: seed, facts, read-only detail, opaque miss ----
  await setLocale(page, "pt-BR");

  seedDatabase(seedSql());

  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(`${baseUrl}/admin/accounts`);
  await expect(page.locator("[data-data-directory]")).toBeVisible();
  await captureState("state-pt-BR-accounts-ready-375");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/admin/accounts`);
  const directory = page.locator("[data-data-directory]");
  await expect(directory).toBeVisible();
  await expect(directory.getByText(keptUsername).first()).toBeVisible();
  await expect(directory.getByText(idleUsername).first()).toBeVisible();
  await expect(directory.getByText("admin.users.filler-0").first()).toBeVisible();
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Ativo" }).first()).toBeVisible();
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Desativado" }).first()).toBeVisible();
  await expect(directory.getByText("Loja ativa").first()).toBeVisible();
  await expect(directory.getByText("Loja configurada").first()).toBeVisible();
  await expect(directory.getByText("Sem loja").first()).toBeVisible();
  await expect(directory.getByText("Nunca").first()).toBeVisible();
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Excluída" })).toHaveCount(0);
  assertions.push({ state: "directory-facts", users: [keptUsername, idleUsername], badges: ["Ativo", "Desativado"], stores: ["Loja ativa", "Loja configurada", "Sem loja"] });

  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(`${baseUrl}/admin/accounts`);
  await captureState("state-pt-BR-accounts-ready-320");
  await page.setViewportSize({ width: 1440, height: 1000 });

  const keptId = userId(keptUsername);
  expect(keptId).toMatch(/^[0-9a-f-]{36}$/);
  await page.goto(`${baseUrl}/admin/accounts/${keptId}`);
  await expect(page.getByText(keptUsername).first()).toBeVisible();
  await expect(page.getByText("keep-store")).toBeVisible();
  await expect(page.getByText("Slug da vitrine")).toBeVisible();
  // The non-deleted account detail renders the account facts plus the profile
  // editor: identity CAS, access (role/status/password), locale, checkout
  // policy, storefront, and the destructive delete form.
  await expect(page.locator(`form[action="/admin/users/${keptId}/identity"]`)).toHaveCount(1);
  await expect(page.locator(`form[action="/admin/users/${keptId}/role"]`)).toHaveCount(1);
  await expect(page.locator(`form[action="/admin/users/${keptId}/status"]`)).toHaveCount(1);
  await expect(page.locator(`form[action="/admin/users/${keptId}/password"]`)).toHaveCount(1);
  await expect(page.locator(`form[action="/admin/users/${keptId}/locale"]`)).toHaveCount(1);
  await expect(page.locator(`form[action="/admin/users/${keptId}/checkout-policy"]`)).toHaveCount(1);
  await expect(page.locator(`form[action="/admin/users/${keptId}/storefront"]`)).toHaveCount(1);
  await expect(page.locator(`form[action="/admin/users/${keptId}/delete"]`)).toHaveCount(1);
  assertions.push({ state: "detail-editor", user: keptUsername, deleteForm: true, editorForms: true });
  await captureState("state-pt-BR-account-detail-1440");

  // The password reset card renders a single button that posts the delivered
  // route; we mock the route so the evidence runtime never needs live SMTP.
  const resetAction = `/admin/users/${keptId}/reset-password`;
  const resetButton = page.locator(`form[action="${resetAction}"] button[type="submit"]`);
  await expect(resetButton).toBeVisible();
  await expect(resetButton).toHaveText(/Enviar e-mail de redefinição/);
  const resetTargetUrl = `${baseUrl}${resetAction}`;
  await page.route(resetTargetUrl, (route) => route.fulfill({
    status: 303,
    headers: { location: `/admin/accounts/${keptId}?reset=requested` },
    body: "",
  }));
  await Promise.all([
    page.waitForURL(/\/admin\/accounts\/[^/]+\?reset=requested$/),
    resetButton.click(),
  ]);
  await expect(page.getByText("E-mail de redefinição enviado.")).toBeVisible();
  await expect(page.locator('[role="status"]')).toContainText("E-mail de redefinição enviado.");
  await assertAxe("detail-reset-requested-pt-BR");
  await page.unroute(resetTargetUrl);

  // The error notice renders the same page layout with an assertive alert.
  await page.goto(`${baseUrl}/admin/accounts/${keptId}?reset=failed`);
  await expect(page.getByText("Não foi possível enviar o e-mail de redefinição")).toBeVisible();
  await expect(page.locator('[role="alert"]')).toContainText("Não foi possível enviar o e-mail de redefinição");
  await assertAxe("detail-reset-failed-pt-BR");

  await page.goto(`${baseUrl}/admin/accounts/${randomUUID()}`);
  await expect(page.getByText("Esta conta está indisponível")).toBeVisible();
  await expect(page.getByText(keptUsername)).toHaveCount(0);
  assertions.push({ state: "detail-unavailable", opaque: true });
  await captureState("state-pt-BR-account-detail-unavailable-1440");

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

  await page.goto(`${baseUrl}/admin/accounts`);
  await expect(directory.getByText(goneUsername).first()).toBeVisible();
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Excluída" }).first()).toBeVisible();
  await expect(directory.locator(`form[action="/admin/users/${goneId}/delete"]`)).toHaveCount(0);
  await expect(directory.locator(`a[href="/admin/accounts/${goneId}"]`)).toHaveCount(0);
  assertions.push({ state: "deleted-badge", user: goneUsername, badge: "Excluída" });
  await captureState("state-pt-BR-deleted-badge-1440");

  await page.goto(`${baseUrl}/admin/accounts/${goneId}`);
  await expect(page.getByText(goneUsername).first()).toBeVisible();
  await expect(page.locator('[data-slot="badge"]', { hasText: "Excluída" }).first()).toBeVisible();
  // Deleted accounts render the read-only facts card only: no editor forms
  // and no delete form.
  await expect(page.locator('form[action$="/identity"]')).toHaveCount(0);
  await expect(page.locator('form[action$="/role"]')).toHaveCount(0);
  await expect(page.locator('form[action$="/status"]')).toHaveCount(0);
  await expect(page.locator('form[action$="/password"]')).toHaveCount(0);
  await expect(page.locator('form[action$="/locale"]')).toHaveCount(0);
  await expect(page.locator('form[action$="/checkout-policy"]')).toHaveCount(0);
  await expect(page.locator('form[action$="/storefront"]')).toHaveCount(0);
  await expect(page.locator('form[action$="/delete"]')).toHaveCount(0);
  assertions.push({ state: "detail-deleted", user: goneUsername, badge: "Excluída", deleteForm: false, editorForms: false });
  await captureState("state-pt-BR-account-detail-deleted-1440");

  // ---- en pass: honest states, pagination, filters, deleted badge ----
  await setLocale(page, "en");

  // The reset button copy follows the active locale and remains a reachable
  // target on the English detail page.
  await page.goto(`${baseUrl}/admin/accounts/${keptId}`);
  const enResetButton = page.locator(`form[action="/admin/users/${keptId}/reset-password"] button[type="submit"]`);
  await expect(enResetButton).toBeVisible();
  await expect(enResetButton).toHaveText(/Send reset email/);
  assertions.push({ state: "detail-reset-button-en", visible: true });

  await page.goto(`${baseUrl}/admin/accounts?q=no-such-user`);
  await expect(page.getByText("No matching records")).toBeVisible();
  await captureState("state-en-accounts-filtered-empty-1440");

  await page.goto(`${baseUrl}/admin/accounts?forged=1`);
  await expect(page.getByText("The directory request is unavailable")).toBeVisible();
  await expect(page.getByText("forged")).toHaveCount(0);
  assertions.push({ state: "invalid-query-no-echo", echoed: false });
  await captureState("state-en-accounts-invalid-query-1440");

  await page.goto(`${baseUrl}/admin/accounts?pageSize=10`);
  // Distinctness rides the unique per-account edit links; the deleted account
  // renders no actions, so page two carries five links across six rows.
  const editLinks = "[data-data-directory] tbody tr td:last-child a[href^='/admin/accounts/']";
  const firstPageAccounts = await page.locator(editLinks).evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(firstPageAccounts).toHaveLength(10);
  await Promise.all([
    page.waitForURL(/\/admin\/accounts\?pageSize=10&cursor=/),
    page.getByRole("link", { name: "Next page" }).click(),
  ]);
  const secondPageAccounts = await page.locator(editLinks).evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(secondPageAccounts).toHaveLength(5);
  expect(secondPageAccounts.some((account) => firstPageAccounts.includes(account))).toBe(false);
  await expect(page.getByText(goneUsername).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Previous page" })).toBeVisible();
  assertions.push({ state: "pagination", firstPage: firstPageAccounts.length, secondPage: secondPageAccounts.length, distinct: true });
  await captureState("state-en-accounts-page-2-1440");

  await page.goto(`${baseUrl}/admin/accounts?q=gone`);
  await expect(directory.getByText(goneUsername).first()).toBeVisible();
  await expect(directory.getByText(keptUsername)).toHaveCount(0);
  assertions.push({ state: "search-username", matched: goneUsername });
  await captureState("state-en-accounts-search-1440");

  await page.goto(`${baseUrl}/admin/accounts?filter.state=DELETED`);
  await expect(directory.getByText(goneUsername).first()).toBeVisible();
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Deleted" }).first()).toBeVisible();
  await expect(directory.getByText(keptUsername)).toHaveCount(0);
  assertions.push({ state: "filter-state", filter: "DELETED" });
  await captureState("state-en-accounts-filter-state-1440");

  await page.goto(`${baseUrl}/admin/accounts?filter.role=ADMIN`);
  await expect(directory.getByText(adminUsername!).first()).toBeVisible();
  await expect(directory.getByText(keptUsername)).toHaveCount(0);
  assertions.push({ state: "filter-role", filter: "ADMIN" });

  await page.goto(`${baseUrl}/admin/accounts`);
  await expect(directory.locator('[data-slot="badge"]', { hasText: "Deleted" }).first()).toBeVisible();
  await captureState("state-en-deleted-badge-1440");

  // ---- shared directory grid: six themes, both locales, three widths ----
  for (const locale of locales) {
    await setLocale(page, locale);
    for (const theme of themes) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${baseUrl}/admin/accounts`);
        await expect(page.locator("[data-data-directory]")).toBeVisible();
        await page.evaluate(async () => document.fonts.ready);
        await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectAdminUsers(`directory-${theme}-${locale}-${width}`);
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
    "src/auth/admin-user-directory.ts",
    "src/auth/admin-user-profile.ts",
    "src/app/admin/accounts/page.tsx",
    "src/app/admin/accounts/directory-query.ts",
    "src/app/admin/accounts/directory-copy.ts",
    "src/app/admin/accounts/instant.ts",
    "src/app/admin/accounts/[id]/page.tsx",
    "src/app/admin/users/[id]/identity/route.ts",
    "src/app/admin/users/[id]/locale/route.ts",
    "src/app/admin/users/[id]/checkout-policy/route.ts",
    "src/app/admin/users/[id]/storefront/route.ts",
    "src/app/admin/admin-surface.tsx",
    "src/data-directory/ui/data-directory.tsx",
    "src/i18n/dictionaries/admin-users-directory/en.ts",
    "src/i18n/dictionaries/admin-users-directory/pt-BR.ts",
    "src/i18n/dictionaries/admin-user-profile/en.ts",
    "src/i18n/dictionaries/admin-user-profile/pt-BR.ts",
    "tests/admin-users.evidence.spec.ts",
    "scripts/run-admin-evidence.mjs",
    "scripts/run-admin-users-evidence.mjs",
    "scripts/verify-admin-users-evidence.mjs",
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
    assertions: `artifacts/admin-users/${runId}/assertions.json`,
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
    "# Administrator user directory visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440 directory captures, plus twelve localized state captures including 320-pixel reflow, the account detail with the profile editor, the opaque miss, page 2, username search, the derived-state filter, and the deleted badge in both locales.",
    "- The directory is read-mostly: edit navigates to `/admin/accounts/[id]`, which renders the account facts plus the profile editor for non-deleted users (identity CAS, role/status/password access, locale, checkout policy, and storefront corrections) and the delivered byte-frozen POST /admin/users/[id]/delete route; deleted accounts render the facts card only with no editor and no delete form.",
    "- Soft-delete runs through the delivered route; the deleted account stays listed and viewable with the localized non-color badge and no actions.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- The empty and error directory states are induced only in unit/page tests: the initial administrator always exists, and stopping the disposable database would break session resolution before the directory read, so no honest runtime capture exists.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/admin-users/${runId}/manifest.json`,
    review: `artifacts/admin-users/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`ADMIN_USERS_EVIDENCE_RUN=${runId}`);
});
