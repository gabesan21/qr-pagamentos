import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const viewports = [320, 375, 768, 1440] as const;
const schemes = ["light", "dark"] as const;
const artifactRoot = join(process.cwd(), "artifacts", "admin");
const baseUrl = process.env.ADMIN_EVIDENCE_BASE_URL ?? "";

function sha256(value: Buffer | string) { return createHash("sha256").update(value).digest("hex"); }

test("creates current authenticated responsive admin evidence", async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!baseUrl || !process.env.ADMIN_EVIDENCE_USERNAME || !process.env.ADMIN_EVIDENCE_PASSWORD, "requires the disposable admin evidence runtime");
  const startedAt = new Date().toISOString();
  const runId = startedAt.replaceAll(/[^\d]/g, "").slice(0, 14);
  const runDirectory = join(artifactRoot, runId);
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const results: Array<Record<string, unknown>> = [];
  let productCreateGate: Promise<void> | null = null;
  await mkdir(runDirectory, { recursive: true });
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({ runId, startedAt, review: null }, null, 2));

  await page.route("**/*", async (route) => {
    if (route.request().url().startsWith(baseUrl) && route.request().method() === "POST") {
      if (new URL(route.request().url()).pathname === "/admin/products" && productCreateGate) await productCreateGate;
      const response = await route.fetch({ maxRedirects: 0 });
      const headers = response.headers();
      if (headers.location) {
        const location = new URL(headers.location, baseUrl);
        headers.location = `${baseUrl}${location.pathname}${location.search}`;
      }
      return route.fulfill({ response, headers });
    }
    if (route.request().url().startsWith(baseUrl)) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel(/Nome de usuário|Username/).fill(process.env.ADMIN_EVIDENCE_USERNAME!);
  await page.getByLabel(/Senha|Password/).fill(process.env.ADMIN_EVIDENCE_PASSWORD!);
  await Promise.all([page.waitForURL(`${baseUrl}/`), page.getByRole("button", { name: /Entrar|Sign in/ }).click()]);
  await page.goto(`${baseUrl}/admin`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Nenhum produto está disponível|No products are available/)).toBeVisible();
  await page.getByLabel(/Nome interno|Internal name/).first().fill("Evidence donation");
  await page.getByLabel(/Título público em português|Public title in Portuguese/).first().fill("Doação de evidência");
  await page.getByLabel(/Descrição pública em português|Public description in Portuguese/).first().fill("Primeira linha\nSegunda linha");
  await page.getByLabel(/Título público em inglês|Public title in English/).first().fill("Evidence donation");
  await page.getByLabel(/Descrição pública em inglês|Public description in English/).first().fill("First line\nSecond line");
  await page.getByLabel(/Preço|Price/).first().fill("1234.56");
  let releaseProductCreate = () => {};
  productCreateGate = new Promise<void>((resolve) => { releaseProductCreate = resolve; });
  let reportProductPending = (_state: Record<string, unknown>) => {};
  const observedProductPending = new Promise<Record<string, unknown>>((resolve) => { reportProductPending = resolve; });
  await page.exposeFunction("reportProductPending", reportProductPending);
  await page.evaluate(() => {
    const submit = document.querySelector<HTMLButtonElement>('form[action$="/admin/products"] button[type="submit"]');
    if (!submit) throw new Error("Product create submit control is missing.");
    const observer = new MutationObserver(() => {
      if (submit.getAttribute("aria-busy") !== "true") return;
      (window as unknown as { reportProductPending: (state: Record<string, unknown>) => void }).reportProductPending({
        busy: submit.getAttribute("aria-busy"),
        disabled: submit.disabled,
        spinners: submit.querySelectorAll('[data-slot="spinner"]').length,
      });
      observer.disconnect();
    });
    observer.observe(submit, { attributes: true, childList: true, subtree: true });
  });
  const createButton = page.getByRole("button", { name: /Criar produto|Create product/ });
  await createButton.click({ noWaitAfter: true });
  expect(await observedProductPending).toEqual({ busy: "true", disabled: true, spinners: 1 });
  releaseProductCreate();
  productCreateGate = null;
  await expect.poll(() => page.url()).toMatch(/\/admin\?success=product-create$/);

  for (const colorScheme of schemes) {
    for (const width of viewports) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${baseUrl}/admin?success=changed`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await page.evaluate(async () => document.fonts.ready);
      const focusTraversal = [];
      const focusable = page.locator('a[href]:not([tabindex="-1"]), button:not(:disabled):not([tabindex="-1"]), input:not(:disabled):not([tabindex="-1"]), select:not(:disabled):not([tabindex="-1"]), textarea:not(:disabled):not([tabindex="-1"]), summary, [tabindex]:not([tabindex="-1"])').filter({ visible: true });
      const fullTraversalCount = await focusable.count();
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      for (let index = 0; index < fullTraversalCount; index += 1) {
        await page.keyboard.press("Tab");
        await expect(focusable.nth(index)).toBeFocused();
        focusTraversal.push(await page.evaluate(() => {
          const element = document.activeElement as HTMLElement;
          const rectangle = element.getBoundingClientRect();
          return { tag: element.tagName, visible: rectangle.width > 0 && rectangle.height >= 44, focusVisible: element.matches(":focus-visible"), outline: Number.parseFloat(getComputedStyle(element).outlineWidth) };
        }));
      }
      expect(focusTraversal.every((item) => item.visible && item.focusVisible && item.outline >= 2)).toBe(true);
      expect(focusTraversal).toHaveLength(fullTraversalCount);
      const measured = await page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [role="checkbox"]')).filter((element) => element.getBoundingClientRect().width > 0);
        const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
        return {
          bodyFont: getComputedStyle(document.body).fontFamily,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          targets: controls.map((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })),
          labels: Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([aria-hidden="true"]), select, textarea')).filter((control) => control.getBoundingClientRect().width > 0).map((control) => control.labels?.length ?? 0),
          actions: forms.map((form) => ({ action: new URL(form.action, window.location.href).pathname, method: form.method })),
          statusCues: Boolean(document.querySelector('[role="status"] svg')),
          locale: document.documentElement.lang,
          product: {
            canonicalInput: document.querySelector<HTMLInputElement>('[name="price"][value="1234.56"]')?.value,
            descriptions: Array.from(document.querySelectorAll<HTMLElement>(".admin-product-description")).map((description) => ({ text: description.textContent, whiteSpace: getComputedStyle(description).whiteSpace })),
            textareas: document.querySelectorAll('[data-slot="textarea"]').length,
          },
        };
      });
      const axe = await new AxeBuilder({ page }).analyze();
      const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
      expect(measured.bodyFont).toContain("IBM Plex Sans");
      expect(measured.overflow).toBe(false);
      expect(measured.targets.length).toBeGreaterThan(0);
      expect(measured.targets.every(({ width: targetWidth, height }) => targetWidth >= 44 && height >= 44)).toBe(true);
      expect(measured.labels.every((count) => count > 0)).toBe(true);
      expect(measured.actions.every(({ method }) => method === "post")).toBe(true);
      expect(measured.statusCues).toBe(true);
      expect(measured.product.canonicalInput).toBe("1234.56");
      expect(measured.product.descriptions.some(({ text, whiteSpace }) => text?.includes("\n") && whiteSpace === "pre-wrap")).toBe(true);
      expect(measured.product.textareas).toBeGreaterThanOrEqual(4);
      expect(["pt-BR", "en"]).toContain(measured.locale);
      expect(severeAxe).toEqual([]);
      expect(externalRequests).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);

      const roleForm = page.locator('form[action$="/role"]').first();
      const roleSelect = roleForm.locator("select");
      const roleTrigger = roleForm.getByRole("button", { name: /Salvar função|Save role/ });
      await roleSelect.focus();
      await page.keyboard.press("Home");
      await expect(roleSelect).toHaveValue("USER");
      await page.keyboard.press("Tab");
      await expect(roleTrigger).toBeFocused();
      await page.keyboard.press("Enter");
      const confirmation = page.getByRole("alert").filter({ hasText: /Confirmar remoção|Confirm administrator demotion/ });
      const cancel = confirmation.getByRole("button", { name: /Cancelar|Cancel/ });
      const confirm = confirmation.getByRole("button", { name: /Confirmar remoção|Confirm demotion/ });
      await expect(cancel).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(confirm).toBeFocused();
      await Promise.all([
        page.waitForURL(/\/admin\?error=change-failed$/),
        page.keyboard.press("Enter"),
      ]);
      await expect(page.getByRole("alert").filter({ hasText: /Revise os dados|Review the details/ })).toBeVisible();

      await page.goto(`${baseUrl}/admin?success=changed`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      const restoredRoleForm = page.locator('form[action$="/role"]').first();
      const restoredRoleSelect = restoredRoleForm.locator("select");
      const restoredRoleTrigger = restoredRoleForm.getByRole("button", { name: /Salvar função|Save role/ });
      await restoredRoleSelect.focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      const restoredConfirmation = page.getByRole("alert").filter({ hasText: /Confirmar remoção|Confirm administrator demotion/ });
      const restoredCancel = restoredConfirmation.getByRole("button", { name: /Cancelar|Cancel/ });
      await expect(restoredCancel).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(restoredRoleTrigger).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(restoredCancel).toBeFocused();

      const keyboardSequence = {
        cancelHandoff: true,
        cancelRestoredTrigger: true,
        confirmationSubmitted: true,
        destructiveSelection: "USER",
        errorRecoveryVisible: true,
        fullTraversalCount,
        productCreatePending: true,
        productDeleteConfirmation: true,
      };
      const productDelete = page.locator(".admin-product details").first();
      await productDelete.locator("summary").click();
      await expect(productDelete.getByRole("button", { name: /Excluir produto permanentemente|Permanently delete product/ })).toBeVisible();
      await restoredCancel.focus();
      const screenshot = join(runDirectory, `admin-${colorScheme}-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({ colorScheme, width, screenshot: screenshot.slice(process.cwd().length + 1), measured, focusTraversal, keyboardSequence, severeAxe, confirmation: true });
      await page.keyboard.press("Enter");
      await expect(restoredRoleTrigger).toBeFocused();
    }
  }

  const resultsPath = join(runDirectory, "assertions.json");
  await writeFile(resultsPath, JSON.stringify(results, null, 2));
  const pngs = await Promise.all(results.map(async ({ screenshot }) => {
    const artifactPath = join(process.cwd(), String(screenshot));
    const [contents, metadata] = await Promise.all([readFile(artifactPath), stat(artifactPath)]);
    return { path: String(screenshot), bytes: metadata.size, sha256: sha256(contents), mtimeMs: metadata.mtimeMs };
  }));
  const assertions = await readFile(resultsPath);
  const manifest = { runId, startedAt, gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), assertions: resultsPath.slice(process.cwd().length + 1), assertionsSha256: sha256(assertions), pngs };
  const manifestPath = join(runDirectory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({ runId, startedAt, manifest: manifestPath.slice(process.cwd().length + 1) }, null, 2));
  console.log(`ADMIN_EVIDENCE_RUN=${runId}`);
});
