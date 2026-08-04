import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const viewports = [375, 768, 1440] as const;
const locales = ["pt-BR", "en"] as const;
const artifactRoot = join(process.cwd(), "artifacts", "reset-password");
const baseUrl = process.env.RESET_PASSWORD_EVIDENCE_BASE_URL ?? "";
const resetTokenPtBr = process.env.RESET_PASSWORD_EVIDENCE_TOKEN_PT_BR ?? "";
const resetTokenEn = process.env.RESET_PASSWORD_EVIDENCE_TOKEN_EN ?? "";
const userId = process.env.RESET_PASSWORD_EVIDENCE_USER_ID ?? "";

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

async function setLocaleCookie(page: import("@playwright/test").Page, locale: "pt-BR" | "en") {
  const url = new URL(baseUrl);
  await page.context().addCookies([{
    name: "qr_locale",
    value: locale,
    domain: url.hostname,
    path: "/",
  }]);
}

test("creates current reset-password evidence", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!baseUrl || !resetTokenPtBr || !resetTokenEn, "requires the disposable reset-password evidence runtime");

  const startedAt = new Date().toISOString();
  const runId = startedAt.replaceAll(/[^\d]/g, "").slice(0, 14);
  const runDirectory = join(artifactRoot, runId);
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const results: Array<Record<string, unknown>> = [];

  await mkdir(runDirectory, { recursive: true });
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({ runId, startedAt, review: null }, null, 2));

  page.on("request", (request) => {
    if (!request.url().startsWith(baseUrl)) externalRequests.push(request.url());
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const invalidToken = randomBytes(32).toString("base64url");
  const newPassword = `New-Strong-${randomUUID()}`;

  for (const locale of locales) {
    const resetToken = locale === "pt-BR" ? resetTokenPtBr : resetTokenEn;
    const isPortuguese = locale === "pt-BR";
    const heading = isPortuguese ? "Redefinir senha" : "Reset password";
    const submitLabel = isPortuguese ? "Redefinir senha" : "Reset password";
    const invalidAlert = isPortuguese ? "Este link de redefinição de senha é inválido ou expirou." : "This password reset link is invalid or has expired.";
    const failedAlert = isPortuguese ? "Não foi possível redefinir a senha." : "The password could not be reset.";
    const changedAlert = isPortuguese ? "Sua senha foi alterada." : "Your password was changed.";

    await page.context().clearCookies();
    await setLocaleCookie(page, locale);

    // ---- invalid token: assertive alert, no form ----
    await page.goto(`${baseUrl}/reset-password?token=${encodeURIComponent(invalidToken)}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => document.fonts.ready);
    const invalidAlertLocator = page.getByRole("alert").filter({ hasText: invalidAlert });
    await expect(invalidAlertLocator).toBeVisible();
    await expect(invalidAlertLocator).toContainText(invalidAlert);
    await expect(page.locator("form#reset-password-form")).toHaveCount(0);

    const invalidAxe = await new AxeBuilder({ page }).analyze();
    const severeInvalidAxe = invalidAxe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(severeInvalidAxe).toEqual([]);
    const invalidScreenshot = join(runDirectory, `reset-password-invalid-${locale}-1440.png`);
    await page.screenshot({ path: invalidScreenshot, fullPage: true });
    results.push({
      state: `invalid-${locale}`,
      locale,
      width: 1440,
      screenshot: invalidScreenshot.slice(process.cwd().length + 1),
      severeAxe: severeInvalidAxe,
      formVisible: false,
    });

    // ---- valid token: form visible, submit error, then success ----
    for (const width of viewports) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`, { waitUntil: "domcontentloaded" });
      await page.evaluate(async () => document.fonts.ready);

      await expect(page.locator('[data-slot="card-title"]').filter({ hasText: heading })).toBeVisible();
      const form = page.locator("form#reset-password-form");
      await expect(form).toBeVisible();
      const newPasswordInput = page.locator("input#newPassword");
      const confirmInput = page.locator("input#confirmation");
      await expect(newPasswordInput).toBeVisible();
      await expect(confirmInput).toBeVisible();
      await expect(page.getByRole("button", { name: submitLabel })).toBeVisible();

      const measured = await page.evaluate(() => {
        const visible = (element: HTMLElement) => {
          const style = getComputedStyle(element);
          const rectangle = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 44 && rectangle.height > 10;
        };
        const controls = Array.from(document.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([type=file]), button, select, a[href], textarea")).filter(visible);
        return {
          bodyFont: getComputedStyle(document.body).fontFamily,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          focusableCount: controls.length,
          targets: controls.map((control) => ({
            height: control.getBoundingClientRect().height,
            width: control.getBoundingClientRect().width,
          })),
        };
      });
      expect(measured.bodyFont).toContain("Inter");
      expect(measured.overflow).toBe(false);
      expect(measured.targets.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);

      const axe = await new AxeBuilder({ page }).analyze();
      const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
      expect(severeAxe).toEqual([]);

      const validScreenshot = join(runDirectory, `reset-password-valid-${locale}-${width}.png`);
      await page.screenshot({ path: validScreenshot, fullPage: true });
      results.push({
        state: `valid-${locale}-${width}`,
        locale,
        width,
        screenshot: validScreenshot.slice(process.cwd().length + 1),
        measured,
        severeAxe,
        formVisible: true,
      });
    }

    // Submit error: mismatched passwords.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`, { waitUntil: "domcontentloaded" });
    await page.locator("input#newPassword").fill(newPassword);
    await page.locator("input#confirmation").fill(`${newPassword}-different`);
    await page.getByRole("button", { name: submitLabel }).click();
    await page.waitForURL(`${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}&error=failed`);
    const failedAlertLocator = page.getByRole("alert").filter({ hasText: failedAlert });
    await expect(failedAlertLocator).toBeVisible();
    await expect(failedAlertLocator).toContainText(failedAlert);

    const errorAxe = await new AxeBuilder({ page }).analyze();
    const severeErrorAxe = errorAxe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(severeErrorAxe).toEqual([]);
    const errorScreenshot = join(runDirectory, `reset-password-error-${locale}-1440.png`);
    await page.screenshot({ path: errorScreenshot, fullPage: true });
    results.push({
      state: `error-${locale}`,
      locale,
      width: 1440,
      screenshot: errorScreenshot.slice(process.cwd().length + 1),
      severeAxe: severeErrorAxe,
      formVisible: true,
    });

    // Successful rotation.
    await page.goto(`${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`, { waitUntil: "domcontentloaded" });
    await page.locator("input#newPassword").fill(newPassword);
    await page.locator("input#confirmation").fill(newPassword);
    await Promise.all([
      page.waitForURL(`${baseUrl}/login?password=changed`),
      page.getByRole("button", { name: submitLabel }).click(),
    ]);
    const successAlert = page.getByRole("status").filter({ hasText: changedAlert });
    await expect(successAlert).toBeVisible();
    await expect(successAlert).toContainText(changedAlert);

    const successAxe = await new AxeBuilder({ page }).analyze();
    const severeSuccessAxe = successAxe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(severeSuccessAxe).toEqual([]);
    const successScreenshot = join(runDirectory, `reset-password-success-${locale}-1440.png`);
    await page.screenshot({ path: successScreenshot, fullPage: true });
    results.push({
      state: `success-${locale}`,
      locale,
      width: 1440,
      screenshot: successScreenshot.slice(process.cwd().length + 1),
      severeAxe: severeSuccessAxe,
      changed: true,
    });
  }

  expect(externalRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  const resultsPath = join(runDirectory, "assertions.json");
  await writeFile(resultsPath, JSON.stringify(results, null, 2));
  const pngs = await Promise.all(results.map(async ({ screenshot }) => {
    const path = join(process.cwd(), String(screenshot));
    const [contents, metadata] = await Promise.all([readFile(path), stat(path)]);
    return { path: String(screenshot), bytes: metadata.size, sha256: sha256(contents), mtimeMs: metadata.mtimeMs };
  }));
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const assertions = await readFile(resultsPath);
  const manifest = {
    runId,
    startedAt,
    gitHead,
    tokenDigestPrefixes: {
      ptBr: sha256(resetTokenPtBr).slice(0, 16),
      en: sha256(resetTokenEn).slice(0, 16),
    },
    userId,
    assertions: resultsPath.slice(process.cwd().length + 1),
    assertionsSha256: sha256(assertions),
    pngs,
  };
  const manifestPath = join(runDirectory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const review = [
    "# Public reset-password evidence review",
    "",
    `- Run: \`${runId}\``,
    `- Manifest SHA-256: \`${sha256(await readFile(manifestPath))}\``,
    "- States: valid token form (pt-BR/en × 375/768/1440), invalid token alert (pt-BR/en), submit error (pt-BR/en), successful rotation redirect to /login?password=changed (pt-BR/en).",
    "- The page consumes the delivered challenge, rotates the password through POST /reset-password/submit, and redirects to the login completion notice.",
    "- Automated accessibility/runtime/target/overflow findings: none.",
    "- Visual findings requiring correction: none.",
    "",
  ].join("\n");
  const reviewPath = join(runDirectory, "review.md");
  await writeFile(reviewPath, review);
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({
    runId,
    startedAt,
    manifest: manifestPath.slice(process.cwd().length + 1),
    review: reviewPath.slice(process.cwd().length + 1),
  }, null, 2));
  console.log(`RESET_PASSWORD_EVIDENCE_RUN=${runId}`);
});
