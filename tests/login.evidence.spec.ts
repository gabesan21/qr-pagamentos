import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const viewports = [320, 375, 768, 1440] as const;
const schemes = ["light", "dark"] as const;
const artifactRoot = join(process.cwd(), "artifacts", "login");
const genericRecovery = "Nome de usuário ou senha inválidos.";
let pendingObservationId = 0;

async function observePendingNativeSubmission(page: import("@playwright/test").Page, trigger: () => Promise<void>) {
  let releaseResponse = () => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const submittedRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/login/submit");
  const callbackName = `reportPendingState${pendingObservationId++}`;
  let resolvePendingState: (state: Record<string, unknown>) => void = () => {};
  const observedPendingState = new Promise<Record<string, unknown>>((resolve) => {
    resolvePendingState = resolve;
  });

  await page.exposeFunction(callbackName, resolvePendingState);
  await page.evaluate((reportName) => {
    const submit = document.querySelector<HTMLButtonElement>('[data-slot="button"]');
    if (!submit) throw new Error("Login submit control is missing.");
    const observer = new MutationObserver(() => {
      if (submit.getAttribute("aria-busy") !== "true") return;
      const state = {
        busy: submit.getAttribute("aria-busy"),
        disabled: submit.disabled,
        label: submit.textContent?.trim(),
        spinners: submit.querySelectorAll('[data-slot="spinner"]').length,
      };
      (window as unknown as Record<string, (value: typeof state) => void>)[reportName](state);
      observer.disconnect();
    });
    observer.observe(submit, { attributes: true, childList: true, subtree: true });
  }, callbackName);
  await page.route("**/login/submit", async (route) => {
    await responseGate;
    await route.fulfill({ body: "", status: 200 });
  });
  await trigger();
  const [request, pendingState] = await Promise.all([submittedRequest, observedPendingState]);
  expect(new URL(request.url()).pathname).toBe("/login/submit");
  expect(request.method()).toBe("POST");
  releaseResponse();
  await page.waitForURL("**/login/submit");
  await page.unroute("**/login/submit");
  expect(pendingState).toEqual({ busy: "true", disabled: true, label: "Entrando", spinners: 1 });
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

test("exposes pending state for native click and Enter submission", async ({ page }) => {
  for (const path of ["click", "enter"] as const) {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Nome de usuário").fill("pending-admin");
    await page.getByLabel("Senha").fill("pending-password");
    await observePendingNativeSubmission(page, async () => {
      if (path === "click") {
        await page.getByRole("button", { name: "Entrar" }).click({ noWaitAfter: true });
      } else {
        await page.getByLabel("Senha").press("Enter", { noWaitAfter: true });
      }
    });
  }
});

test("creates current, responsive login evidence", async ({ page }) => {
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
    if (route.request().url().startsWith("http://127.0.0.1:4319")) {
      await route.continue();
      return;
    }
    externalRequests.push(route.request().url());
    await route.abort();
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const colorScheme of schemes) {
    for (const width of viewports) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.evaluate(async () => document.fonts.ready);

      const focusOrder: string[] = [];
      const focusTraversal = [];
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      for (let index = 0; index < 3; index += 1) {
        await page.keyboard.press("Tab");
        const focusState = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (!element) return { id: "", visible: false, focusVisible: false, ring: "" };
          const rectangle = element.getBoundingClientRect();
          const styles = getComputedStyle(element);
          return {
            id: element.id || element.getAttribute("data-slot") || element.tagName,
            visible: rectangle.width > 0 && rectangle.height > 0 && rectangle.bottom > 0 && rectangle.top < window.innerHeight,
            focusVisible: element.matches(":focus-visible"),
            ring: styles.boxShadow,
          };
        });
        focusOrder.push(focusState.id);
        expect(focusState.visible).toBe(true);
        expect(focusState.focusVisible).toBe(true);
        expect(focusState.ring).not.toBe("none");
        focusTraversal.push(focusState);
      }
      expect(focusOrder).toEqual(["username", "password", "button"]);

      const measured = await page.evaluate(() => {
        const element = <T extends Element>(selector: string) => document.querySelector<T>(selector);
        const luminance = (value: string) => {
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) return 0;
          context.fillStyle = value;
          context.fillRect(0, 0, 1, 1);
          const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
          const linear = channels.map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        };
        const contrast = (foreground: string, background: string) => {
          const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
          return (lighter + 0.05) / (darker + 0.05);
        };
        const username = element<HTMLInputElement>("#username");
        const password = element<HTMLInputElement>("#password");
        const submit = element<HTMLElement>('[data-slot="button"]');
        const form = element<HTMLFormElement>("form");
        const brand = element<HTMLElement>('[data-brand-identity="product-lockup"]');
        const brandMark = element<SVGSVGElement>("[data-brand-mark]");
        const card = element<HTMLElement>('[data-slot="card"]');
        return {
          bodyFont: getComputedStyle(document.body).fontFamily,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          formAction: form ? new URL(form.action).pathname : "",
          formMethod: form?.method ?? "",
          username: username ? { autocomplete: username.autocomplete, required: username.required, labels: username.labels?.length ?? 0, height: username.getBoundingClientRect().height } : null,
          password: password ? { autocomplete: password.autocomplete, required: password.required, type: password.type, labels: password.labels?.length ?? 0, height: password.getBoundingClientRect().height } : null,
          submit: submit ? { height: submit.getBoundingClientRect().height, disabled: (submit as HTMLButtonElement).disabled } : null,
          brand: brand && brandMark && card ? {
            name: brand.textContent?.trim(),
            decorativeMark: brandMark.getAttribute("aria-hidden"),
            markSize: Math.min(brandMark.getBoundingClientRect().width, brandMark.getBoundingClientRect().height),
            width: brand.getBoundingClientRect().width,
            contrast: contrast(getComputedStyle(brand).color, getComputedStyle(card).backgroundColor),
          } : null,
        };
      });
      const axe = await new AxeBuilder({ page }).analyze();
      const severeAxe = axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));

      expect(measured.overflow).toBe(false);
      expect(measured.bodyFont).toContain("IBM Plex Sans");
      expect(measured.formAction).toBe("/login/submit");
      expect(measured.formMethod).toBe("post");
      expect(measured.username).toMatchObject({ autocomplete: "username", required: true, labels: 1 });
      expect(measured.password).toMatchObject({ autocomplete: "current-password", required: true, type: "password", labels: 1 });
      expect(measured.username?.height).toBeGreaterThanOrEqual(44);
      expect(measured.password?.height).toBeGreaterThanOrEqual(44);
      expect(measured.submit?.height).toBeGreaterThanOrEqual(44);
      expect(measured.submit?.disabled).toBe(false);
      expect(measured.brand).toMatchObject({ name: "QR Pagamentos", decorativeMark: "true" });
      expect(measured.brand?.markSize).toBeGreaterThanOrEqual(32);
      expect(measured.brand?.width).toBeGreaterThanOrEqual(120);
      expect(measured.brand?.contrast).toBeGreaterThanOrEqual(4.5);
      expect(severeAxe).toEqual([]);

      await page.goto("/login?error=invalid-credentials", { waitUntil: "domcontentloaded" });
      const recovery = await page.evaluate(() => {
        const alert = document.querySelector<HTMLElement>('[role="alert"]');
        return { text: alert?.textContent?.trim() ?? "", visible: alert ? alert.getBoundingClientRect().height > 0 : false };
      });
      const recoveryAxe = await new AxeBuilder({ page }).analyze();
      const severeRecoveryAxe = recoveryAxe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
      expect(recovery.visible).toBe(true);
      expect(recovery.text).toBe(genericRecovery);
      expect(severeRecoveryAxe).toEqual([]);

      expect(externalRequests).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);

      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await page.evaluate(async () => document.fonts.ready);
      const screenshot = join(runDirectory, `login-${colorScheme}-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({ colorScheme, width, screenshot: screenshot.slice(process.cwd().length + 1), measured, focusTraversal, recovery, severeAxe, severeRecoveryAxe });
    }
  }

  const resultsPath = join(runDirectory, "assertions.json");
  await writeFile(resultsPath, JSON.stringify(results, null, 2));
  const pngs = await Promise.all(results.map(async ({ screenshot }) => {
    const path = join(process.cwd(), String(screenshot));
    const [contents, metadata] = await Promise.all([readFile(path), stat(path)]);
    return { path: String(screenshot), bytes: metadata.size, sha256: sha256(contents), mtimeMs: metadata.mtimeMs };
  }));
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const assertions = await readFile(resultsPath);
  const brandManifestPath = "src/brand/assets.manifest.json";
  const brandManifest = await readFile(join(process.cwd(), brandManifestPath));
  const manifest = { runId, startedAt, gitHead, brandManifest: { path: brandManifestPath, sha256: sha256(brandManifest) }, assertions: resultsPath.slice(process.cwd().length + 1), assertionsSha256: sha256(assertions), pngs };
  const manifestPath = join(runDirectory, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await writeFile(join(artifactRoot, "current.json"), JSON.stringify({ runId, startedAt, manifest: manifestPath.slice(process.cwd().length + 1) }, null, 2));
  console.log(`LOGIN_EVIDENCE_RUN=${runId}`);
});
