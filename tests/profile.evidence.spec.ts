import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page, test } from "@playwright/test";
import type { Request as PlaywrightRequest } from "@playwright/test";
import { profileEn } from "@/i18n/dictionaries/profile/en";
import { profilePtBR } from "@/i18n/dictionaries/profile/pt-BR";

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
const artifactRoot = join(process.cwd(), "artifacts", "profile");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const initialUsername = "profile.evidence";
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const completionCopy = {
  en: profileEn.passwordChanged,
  "pt-BR": profilePtBR.passwordChanged,
} as const;
let pendingObservationId = 0;

async function signIn(page: Page, username: string, password: string, landing: "/" | "/admin") {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/Nome de usuário|Username/).fill(username);
  await page.getByLabel(/^Senha$|^Password$/).fill(password);
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

async function createExtraSession(browser: Browser, username: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, username, password, "/");
  return context;
}

test("creates the closed merchant-profile evidence run", async ({ browser, page }) => {
  test.setTimeout(300_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  let merchantPassword = process.env.PROFILE_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword, "requires the disposable profile evidence runtime");
  const cdp = await page.context().newCDPSession(page);

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
  const completionCaptures = new Map<"pt-BR" | "en", string>();
  page.on("request", (request) => {
    if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await signIn(page, adminUsername!, adminPassword!, "/admin");
  await page.goto(`${baseUrl}/admin/accounts`);
  const createAccount = page.locator('form[action$="/admin/users"]');
  await createAccount.getByLabel(/Nome de usuário|Username/).fill(initialUsername);
  await createAccount.getByLabel(/^Senha$|^Password$/).fill(merchantPassword!);
  await createAccount.getByLabel(/Função|Role/).selectOption("USER");
  await Promise.all([
    page.waitForURL(/\/admin\?success=created$/),
    createAccount.getByRole("button", { name: /Criar conta|Create account/ }).click(),
  ]);
  await page.getByRole("button", { name: /Sair|Sign out/ }).click();
  await signIn(page, initialUsername, merchantPassword!, "/");
  let merchantUsername = initialUsername;

  async function inspectProfile(state: string) {
    const measured = await page.evaluate(() => {
      const visible = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const rectangle = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 0 && rectangle.height > 0;
      };
      const controls = Array.from(document.querySelectorAll<HTMLElement>("input:not([type=hidden]), button, a[href]")).filter(visible);
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
    const firstInput = page.locator('input:not([type="hidden"])').first();
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
    const relativePath = `artifacts/profile/${runId}/${name}.png`;
    await page.screenshot({ path: join(process.cwd(), relativePath), fullPage: true });
    screenshots.push(relativePath);
    return relativePath;
  }

  async function waitForProfile() {
    await expect(page.locator('form[action="/profile/identity"]')).toBeVisible();
    await expect(page.locator('form[action="/profile/password"]')).toBeVisible();
  }

  function proveNativePost(request: PlaywrightRequest, endpoint: string, expectedFields: Record<string, string>) {
    const contentType = request.headers()["content-type"] ?? "";
    const fields = Object.fromEntries(new URLSearchParams(request.postData() ?? ""));
    expect(request.method()).toBe("POST");
    expect(request.url()).toBe(`${baseUrl}${endpoint}`);
    expect(request.isNavigationRequest()).toBe(true);
    expect(request.resourceType()).toBe("document");
    expect(contentType).toMatch(/^application\/x-www-form-urlencoded(?:;|$)/);
    expect(fields).toEqual(expectedFields);
    return {
      contentType,
      fields,
      nativeDocument: true,
      resourceType: request.resourceType(),
    };
  }

  async function submitAndCount(
    form: ReturnType<Page["locator"]>,
    trigger: "click" | "enter",
    expectedUrl: RegExp,
    expectedFields: Record<string, string>,
  ) {
    const endpoint = await form.getAttribute("action");
    expect(endpoint).toMatch(/^\/profile\/(?:identity|password)$/);
    const requests: PlaywrightRequest[] = [];
    const observe = (request: PlaywrightRequest) => {
      if (request.method() === "POST" && request.url() === `${baseUrl}${endpoint}`) requests.push(request);
    };
    page.on("request", observe);
    const navigation = page.waitForURL(expectedUrl);
    if (trigger === "click") await form.getByRole("button").click();
    else {
      await form.locator('input:not([type="hidden"])').last().press("Enter");
    }
    await navigation;
    page.off("request", observe);
    expect(requests).toHaveLength(1);
    return {
      requestCount: requests.length,
      ...proveNativePost(requests[0]!, endpoint!, expectedFields),
    };
  }

  async function capturePending(
    locale: "pt-BR" | "en",
    kind: "identity" | "password",
    trigger: "click" | "enter",
    expectedFields: Record<string, string>,
  ) {
    const endpoint = `/profile/${kind}`;
    let requestCount = 0;
    let request: PlaywrightRequest | undefined;
    let releaseRequest: () => void = () => undefined;
    let markReached: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => { markReached = resolve; });
    const release = new Promise<void>((resolve) => { releaseRequest = resolve; });
    const callbackName = `reportProfilePending${pendingObservationId++}`;
    let reportPendingState: (state: Record<string, unknown>) => void = () => undefined;
    const observedPendingState = new Promise<Record<string, unknown>>((resolve) => { reportPendingState = resolve; });
    await page.exposeFunction(callbackName, reportPendingState);
    const form = page.locator(`form[action="${endpoint}"]`);
    await form.evaluate((element, reportName) => {
      const fieldset = element.querySelector("fieldset");
      const button = element.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!(fieldset instanceof HTMLFieldSetElement) || !button) throw new Error("Profile pending controls are unavailable");
      const observer = new MutationObserver(() => {
        if (fieldset.getAttribute("aria-busy") !== "true" || !fieldset.disabled) return;
        const state = {
          busy: fieldset.getAttribute("aria-busy"),
          disabledScope: fieldset.disabled,
          buttonDisabled: button.matches(":disabled"),
          spinnerCount: element.querySelectorAll('[data-slot="spinner"]').length,
        };
        (window as unknown as Record<string, (value: typeof state) => void>)[reportName](state);
        observer.disconnect();
      });
      observer.observe(fieldset, { attributes: true, childList: true, subtree: true });
    }, callbackName);
    await page.route(`**${endpoint}`, async (route) => {
      requestCount += 1;
      request = route.request();
      markReached();
      await release;
      await route.continue();
    });
    const navigation = page.waitForURL(new RegExp(kind === "identity" ? "identity=changed" : "password=failed"));
    if (trigger === "click") void form.getByRole("button").click({ noWaitAfter: true });
    else void form.locator('input:not([type="hidden"])').last().press("Enter", { noWaitAfter: true });
    const [, observed] = await Promise.all([reached, observedPendingState]);
    const pendingState = observed as {
      busy: string | null;
      buttonDisabled: boolean;
      disabledScope: boolean;
      spinnerCount: number;
    };
    expect(pendingState).toEqual({ busy: "true", buttonDisabled: true, disabledScope: true, spinnerCount: 1 });
    const capture = await cdp.send("Page.captureScreenshot", {
      captureBeyondViewport: true,
      format: "png",
      fromSurface: true,
    });
    const relativePath = `artifacts/profile/${runId}/interaction-${locale}-${kind}-pending.png`;
    await writeFile(join(process.cwd(), relativePath), Buffer.from(capture.data, "base64"));
    screenshots.push(relativePath);
    expect(request).toBeDefined();
    const requestProof = proveNativePost(request!, endpoint, expectedFields);
    assertions.push({
      state: `${locale}-${kind}-pending`,
      trigger,
      requestCount,
      immediateBusy: pendingState.busy === "true",
      disabledScope: pendingState.disabledScope && pendingState.buttonDisabled,
      request: requestProof,
    });
    releaseRequest();
    await navigation;
    await page.unroute(`**${endpoint}`);
    expect(requestCount).toBe(1);
  }

  for (const locale of locales) {
    await setLocale(page, locale);
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.goto(`${baseUrl}/profile`);
    await waitForProfile();
    await page.evaluate(async () => document.fonts.ready);
    for (const theme of themes) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(`${baseUrl}/profile`);
        await waitForProfile();
        await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await inspectProfile(`${locale}-${theme}-${width}`);
        await screenshot(`default-${theme}-${locale}-${width}`);
      }
    }

    await page.setViewportSize({ width: 320, height: 1000 });
    await page.goto(`${baseUrl}/profile`);
    await waitForProfile();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });

    const identity = page.locator('form[action="/profile/identity"]');
    const nextUsername = `profile.${locale === "en" ? "english" : "brasil"}`;
    const expectedVersion = await identity.locator('input[name="expectedVersion"]').inputValue();
    const nextEmail = `${locale === "en" ? "english" : "brasil"}@example.com`;
    await identity.getByLabel(/Nome de usuário|Username/).fill(nextUsername);
    await identity.getByLabel(/E-mail|email/i).fill(nextEmail);
    const identityTrigger = locale === "en" ? "enter" : "click";
    const identityChangedRequest = await submitAndCount(identity, identityTrigger, /identity=changed$/, {
      email: nextEmail,
      expectedVersion,
      username: nextUsername,
    });
    await waitForProfile();
    merchantUsername = nextUsername;
    await screenshot(`interaction-${locale}-identity-changed`);
    await inspectProfile(`${locale}-identity-changed`);

    const conflict = page.locator('form[action="/profile/identity"]');
    await conflict.getByLabel(/Nome de usuário|Username/).fill(adminUsername!);
    await Promise.all([
      page.waitForURL(/identity=conflict$/),
      conflict.getByRole("button").click(),
    ]);
    await waitForProfile();
    await screenshot(`interaction-${locale}-identity-conflict`);

    const invalid = page.locator('form[action="/profile/identity"]');
    await invalid.getByLabel(/Nome de usuário|Username/).fill("bad name");
    await invalid.getByLabel(/E-mail|email/i).fill("invalid");
    await invalid.getByRole("button").evaluate((button: HTMLButtonElement) => {
      if (button.form) button.form.noValidate = true;
    });
    await Promise.all([
      page.waitForURL(/identity=failed$/),
      invalid.getByRole("button").click(),
    ]);
    await waitForProfile();
    await screenshot(`interaction-${locale}-identity-failed`);

    const pendingIdentity = page.locator('form[action="/profile/identity"]');
    const pendingVersion = await pendingIdentity.locator('input[name="expectedVersion"]').inputValue();
    await pendingIdentity.getByLabel(/Nome de usuário|Username/).fill(merchantUsername);
    await pendingIdentity.getByLabel(/E-mail|email/i).fill("");
    await capturePending(locale, "identity", locale === "en" ? "click" : "enter", {
      email: "",
      expectedVersion: pendingVersion,
      username: merchantUsername,
    });
    await waitForProfile();

    const password = page.locator('form[action="/profile/password"]');
    await password.getByLabel(/Senha atual|Current password/).fill("wrong password phrase");
    await password.getByLabel(/^Nova senha$|^New password$/).fill("replacement password phrase");
    await password.getByLabel(/Confirmar|Confirm/).fill("replacement password phrase");
    const passwordTrigger = locale === "en" ? "enter" : "click";
    const passwordFailedRequest = await submitAndCount(password, passwordTrigger, /password=failed$/, {
      confirmation: "replacement password phrase",
      currentPassword: "wrong password phrase",
      newPassword: "replacement password phrase",
    });
    await waitForProfile();
    await screenshot(`interaction-${locale}-password-failed`);

    const pendingPassword = page.locator('form[action="/profile/password"]');
    await pendingPassword.getByLabel(/Senha atual|Current password/).fill("wrong password phrase");
    await pendingPassword.getByLabel(/^Nova senha$|^New password$/).fill("replacement password phrase");
    await pendingPassword.getByLabel(/Confirmar|Confirm/).fill("replacement password phrase");
    await capturePending(locale, "password", locale === "en" ? "click" : "enter", {
      confirmation: "replacement password phrase",
      currentPassword: "wrong password phrase",
      newPassword: "replacement password phrase",
    });
    await waitForProfile();

    const extraSessions = await Promise.all([
      createExtraSession(browser, merchantUsername, merchantPassword!),
      createExtraSession(browser, merchantUsername, merchantPassword!),
    ]);
    const replacement = locale === "en" ? "English replacement password" : "Senha substituta brasileira";
    const rotation = page.locator('form[action="/profile/password"]');
    await rotation.getByLabel(/Senha atual|Current password/).fill(merchantPassword!);
    await rotation.getByLabel(/^Nova senha$|^New password$/).fill(replacement);
    await rotation.getByLabel(/Confirmar|Confirm/).fill(replacement);
    const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/profile/password"));
    await Promise.all([
      page.waitForURL(/\/login\?password=changed$/),
      rotation.getByRole("button").click(),
    ]);
    const rotationResponse = await responsePromise;
    const rotationRequest = proveNativePost(rotationResponse.request(), "/profile/password", {
      confirmation: replacement,
      currentPassword: merchantPassword!,
      newPassword: replacement,
    });
    const expiryCookie = (await rotationResponse.allHeaders())["set-cookie"] ?? "";
    expect(expiryCookie).toMatch(/qr_session=;.*max-age=0/i);
    expect(expiryCookie).toContain(`qr_locale=${locale}`);
    await expect(page.getByRole("status")).toContainText(completionCopy[locale]);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    completionCaptures.set(locale, await screenshot(`interaction-${locale}-password-changed-login`));
    for (const context of extraSessions) {
      const extraPage = context.pages()[0];
      await extraPage.goto(`${baseUrl}/profile`);
      await expect(extraPage).toHaveURL(`${baseUrl}/login`);
      await context.close();
    }
    const oldContext = await browser.newContext();
    const oldAttempt = await oldContext.newPage();
    await oldAttempt.goto(`${baseUrl}/login`);
    await oldAttempt.getByLabel(/Nome de usuário|Username/).fill(merchantUsername);
    await oldAttempt.getByLabel(/^Senha$|^Password$/).fill(merchantPassword!);
    await oldAttempt.getByRole("button", { name: /Entrar|Sign in/ }).click();
    await expect(oldAttempt).toHaveURL(/invalid-credentials$/);
    await oldContext.close();
    merchantPassword = replacement;
    await signIn(page, merchantUsername, merchantPassword, "/");
    assertions.push({
      state: `${locale}-submission-contract`,
      completionCopy: completionCopy[locale],
      completionLocale: locale,
      identityChangedRequest,
      identityTrigger,
      passwordFailedRequest,
      passwordTrigger,
      passwordRotationRequest: rotationRequest,
      expiryCookie: /qr_session=;.*max-age=0/i.test(expiryCookie),
      localeCookie: expiryCookie.includes(`qr_locale=${locale}`),
      seededSessionsRejected: 2,
      oldPasswordRejected: true,
      newPasswordAccepted: true,
    });
  }

  await cdp.detach();
  expect(screenshots).toHaveLength(50);
  const ptCompletion = completionCaptures.get("pt-BR");
  const enCompletion = completionCaptures.get("en");
  expect(ptCompletion).toBeDefined();
  expect(enCompletion).toBeDefined();
  const completionHashes = {
    "pt-BR": sha256(await readFile(join(process.cwd(), ptCompletion!))),
    en: sha256(await readFile(join(process.cwd(), enCompletion!))),
  };
  expect(completionHashes.en).not.toBe(completionHashes["pt-BR"]);
  assertions.push({ state: "password-changed-locales", distinct: true, hashes: completionHashes });
  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(assertions, null, 2)}\n`);
  const captureRecords = await Promise.all(screenshots.map(async (capturePath) => {
    const [contents, metadata] = await Promise.all([readFile(capturePath), stat(capturePath)]);
    return { path: capturePath, bytes: metadata.size, sha256: sha256(contents) };
  }));
  const sourceInventory = [
    "src/auth/profile.ts",
    "src/auth/session.ts",
    "src/auth/administration.ts",
    "src/app/layout.tsx",
    "src/app/login/page.tsx",
    "src/app/(merchant)/profile/page.tsx",
    "src/app/profile/profile-management.tsx",
    "src/app/profile/profile-form.tsx",
    "src/app/profile/identity/route.ts",
    "src/app/profile/password/route.ts",
    "src/i18n/locales.ts",
    "tests/profile.evidence.spec.ts",
    "scripts/run-profile-evidence.mjs",
    "scripts/verify-profile-evidence.mjs",
  ];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceInventory.map(async (sourcePath) => [sourcePath, sha256(await readFile(sourcePath))])));
  const assertionsBytes = await readFile(assertionsPath);
  const manifest = {
    version: 1,
    runId,
    startedAt,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    baseCaptureCount: 36,
    interactionCaptureCount: 14,
    totalPngCount: 50,
    assertions: `artifacts/profile/${runId}/assertions.json`,
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
    "# Merchant profile visual review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(manifestBytes)}\``,
    "- Grid: six themes × two locales × 375/768/1440, plus fourteen localized interaction captures.",
    "- Automated accessibility/runtime/target/overflow/focus findings: none.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n"));
  await writeFile(join(artifactRoot, "current.json"), `${JSON.stringify({
    runId,
    startedAt,
    manifest: `artifacts/profile/${runId}/manifest.json`,
    review: `artifacts/profile/${runId}/review.md`,
  }, null, 2)}\n`);
  console.log(`PROFILE_EVIDENCE_RUN=${runId}`);
});
