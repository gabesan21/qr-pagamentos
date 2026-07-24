import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const viewports = [320, 375, 768, 1440] as const;
const themes = [
  "pix-paper",
  "cashier-daylight",
  "settlement-sand",
  "midnight-clearing",
  "vault-blue",
  "terminal-amber",
] as const;
const artifactRoot = join(process.cwd(), "artifacts", "app-shell");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";
const merchantUsername = "evidence.merchant";

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

async function signIn(page: Page, username: string, password: string, landing: "/" | "/admin") {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/Nome de usuário|Username/).fill(username);
  await page.getByLabel(/Senha|Password/).fill(password);
  await Promise.all([
    page.waitForURL(`${baseUrl}${landing}`),
    page.getByRole("button", { name: /Entrar|Sign in/ }).click(),
  ]);
}

test("creates current six-theme evidence for both role shells", async ({ page }) => {
  test.setTimeout(180_000);
  const adminUsername = process.env.ADMIN_EVIDENCE_USERNAME;
  const adminPassword = process.env.ADMIN_EVIDENCE_PASSWORD;
  const merchantPassword = process.env.APP_SHELL_EVIDENCE_MERCHANT_PASSWORD;
  test.skip(!baseUrl || !adminUsername || !adminPassword || !merchantPassword, "requires the disposable shell evidence runtime");

  const startedAt = new Date().toISOString();
  const runId = startedAt.replaceAll(/[^\d]/g, "").slice(0, 14);
  const runDirectory = join(artifactRoot, runId);
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const results: Array<Record<string, unknown>> = [];
  await mkdir(runDirectory, { recursive: true });
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({ runId, startedAt, review: null }, null, 2));

  await page.route("**/*", async (route) => {
    if (route.request().url().startsWith(baseUrl)) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await signIn(page, adminUsername!, adminPassword!, "/admin");
  await page.goto(`${baseUrl}/admin/accounts`);
  const createAccount = page.locator('form[action$="/admin/users"]');
  await createAccount.getByLabel(/Nome de usuário|Username/).fill(merchantUsername);
  await createAccount.getByLabel(/Senha|Password/).fill(merchantPassword!);
  await createAccount.getByLabel(/Função|Role/).selectOption("USER");
  await Promise.all([
    page.waitForURL(/\/admin\?success=created$/),
    createAccount.getByRole("button", { name: /Criar conta|Create account/ }).click(),
  ]);

  const roles = [
    {
      id: "admin",
      identity: "compact-role-lockup",
      navigation: /Áreas da administração|Administrator areas/,
      route: "/admin",
    },
    {
      id: "merchant",
      identity: "merchant-fallback",
      navigation: /Áreas do lojista|Merchant areas/,
      route: "/",
    },
  ] as const;

  for (const role of roles) {
    if (role.id === "merchant") {
      await page.getByRole("button", { name: /Sair|Sign out/ }).click();
      await page.waitForURL(`${baseUrl}/login`);
      await signIn(page, merchantUsername, merchantPassword!, "/");
    }
    for (const theme of themes) {
      for (const width of viewports) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(`${baseUrl}${role.route}`, { waitUntil: "domcontentloaded" });
        await page.evaluate((themeId) => { document.documentElement.dataset.theme = themeId; }, theme);
        await page.evaluate(async () => document.fonts.ready);

        await page.keyboard.press("Tab");
        const skipLink = page.locator(".app-shell__skip-link");
        await expect(skipLink).toBeFocused();
        const skipToContent = await skipLink.evaluate((link: HTMLAnchorElement) => {
          const rectangle = link.getBoundingClientRect();
          const centerX = rectangle.left + rectangle.width / 2;
          const centerY = rectangle.top + rectangle.height / 2;
          const hit = document.elementFromPoint(centerX, centerY);
          const style = getComputedStyle(link);
          return {
            hitIsLink: hit === link || link.contains(hit),
            outlineWidth: Number.parseFloat(style.outlineWidth),
            rectangle: {
              bottom: rectangle.bottom,
              left: rectangle.left,
              right: rectangle.right,
              top: rectangle.top,
            },
            visible: style.visibility !== "hidden"
              && rectangle.top >= 0
              && rectangle.left >= 0
              && rectangle.bottom <= window.innerHeight
              && rectangle.right <= window.innerWidth,
          };
        });
        expect(skipToContent.visible).toBe(true);
        expect(skipToContent.outlineWidth).toBeGreaterThanOrEqual(2);
        expect(skipToContent.hitIsLink).toBe(true);
        await page.keyboard.press("Enter");
        await expect(page.locator("#app-shell-content")).toBeFocused();
        expect(new URL(page.url()).hash).toBe("#app-shell-content");

        const navigation = page.getByRole("navigation", { name: role.navigation });
        if (width <= 768) {
          await expect(navigation).toHaveCount(0);
          const disclosure = page.getByRole("button", { name: /Abrir navegação|Open navigation/ });
          await disclosure.click();
          await expect(navigation).toHaveCount(1);
          await expect(navigation.getByRole("link")).toHaveCount(5);
          await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
          await page.getByRole("button", { name: /Fechar navegação|Close navigation/ }).click();
          await expect(navigation).toHaveCount(0);
        } else {
          await expect(navigation).toHaveCount(1);
          await expect(navigation.getByRole("link")).toHaveCount(5);
          await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
        }
        const identities = page.locator(`[data-brand-identity="${role.identity}"]`);
        await expect(identities).toHaveCount(2);
        await expect(identities.filter({ visible: true })).toHaveCount(1);

        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

        const measured = await page.evaluate(() => {
          const visible = (element: HTMLElement) => {
            const style = getComputedStyle(element);
            const rectangle = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rectangle.width > 0 && rectangle.height > 0;
          };
          const targets = Array.from(document.querySelectorAll<HTMLElement>("a[href], button")).filter(visible);
          return {
            bodyFont: getComputedStyle(document.body).fontFamily,
            focusOrder: targets.map((target) => target.textContent?.trim()),
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            targets: targets.map((target) => ({
              height: target.getBoundingClientRect().height,
              width: target.getBoundingClientRect().width,
            })),
          };
        });
        expect(measured.bodyFont).toContain("IBM Plex Sans");
        expect(measured.overflow).toBe(false);
        expect(measured.targets.every(({ height, width: targetWidth }) => height >= 44 && targetWidth >= 44)).toBe(true);

        const axe = await new AxeBuilder({ page }).analyze();
        const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
        expect(severeAxe).toEqual([]);
        expect(externalRequests).toEqual([]);
        expect(consoleErrors).toEqual([]);
        expect(pageErrors).toEqual([]);

        const screenshot = join(runDirectory, `${role.id}-${theme}-${width}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        results.push({
          role: role.id,
          theme,
          width,
          screenshot: screenshot.slice(process.cwd().length + 1),
          measured,
          severeAxe,
          skipToContent,
        });
      }
    }

    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(`${baseUrl}${role.route}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { document.documentElement.dataset.theme = "pix-paper"; });
    const disclosure = page.getByRole("button", { name: /Abrir navegação|Open navigation/ });
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await disclosure.click();
    await expect(page.getByRole("button", { name: /Fechar navegação|Close navigation/ })).toHaveAttribute("aria-expanded", "true");
    const mobileScreenshot = join(runDirectory, `${role.id}-mobile-open.png`);
    await page.screenshot({ path: mobileScreenshot, fullPage: true });
    results.push({
      role: role.id,
      state: "mobile-open",
      screenshot: mobileScreenshot.slice(process.cwd().length + 1),
    });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}/orders/not-a-real-order`);
  await expect(page.getByRole("link", { name: /Pedidos|Orders/ })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: /Sair|Sign out/ }).click();
  await page.waitForURL(`${baseUrl}/login`);
  await signIn(page, adminUsername!, adminPassword!, "/admin");
  await page.goto(`${baseUrl}/admin/orders/not-a-real-order`);
  await expect(page.getByRole("link", { name: /Pedidos|Orders/ })).toHaveAttribute("aria-current", "page");

  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, JSON.stringify(results, null, 2));
  const captures = await Promise.all(results.map(async ({ screenshot }) => {
    const artifactPath = join(process.cwd(), String(screenshot));
    const [contents, metadata] = await Promise.all([readFile(artifactPath), stat(artifactPath)]);
    return { path: String(screenshot), bytes: metadata.size, sha256: sha256(contents), mtimeMs: metadata.mtimeMs };
  }));
  const assertions = await readFile(assertionsPath);
  const manifest = {
    runId,
    startedAt,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    assertions: assertionsPath.slice(process.cwd().length + 1),
    assertionsSha256: sha256(assertions),
    captures,
    baseCaptureCount: 48,
    mobileOpenCaptureCount: 2,
    nestedActiveRoutes: ["/orders/not-a-real-order", "/admin/orders/not-a-real-order"],
  };
  const manifestPath = join(runDirectory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({
    runId,
    startedAt,
    manifest: manifestPath.slice(process.cwd().length + 1),
  }, null, 2));
  console.log(`APP_SHELL_EVIDENCE_RUN=${runId}`);
});
