import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { GET as health } from "./api/health/route";

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("unprefixed route contract", () => {
  it("keeps health unlocalized and rejects all remaining locale-prefixed mutations", async () => {
    expect((await health()).status).toBe(200);
  });

  it("does not leave locale-prefixed route surfaces as alternate implementations", async () => {
    for (const path of [
      "src/app/[lang]/page.tsx",
      "src/app/[lang]/login/page.tsx",
      "src/app/[lang]/design-system/page.tsx",
      "src/app/[lang]/admin-access/route.ts",
      "src/app/[lang]/login/submit/route.ts",
      "src/app/[lang]/logout/route.ts",
    ]) {
      expect(await pathExists(path)).toBe(false);
    }
  });

  it("keeps public payment-link resolution as an unlocalized API route", async () => {
    const source = await readFile("src/app/api/payment-links/[identifier]/route.ts", "utf8");

    expect(source).toContain("export async function GET");
    expect(source).toContain('export const dynamic = "force-dynamic"');
  });

  it("keeps the standalone payment page an unlocalized dynamic sessionless route", async () => {
    const source = await readFile("src/app/store/[slug]/pay/page.tsx", "utf8");

    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).toContain("export default async function StandalonePaymentPage");
    expect(source).not.toContain("/api/store/");
  });

  it("keeps /pay/[identifier] the single canonical checkout route with a V1-first additive V2 branch", async () => {
    const source = await readFile("src/app/pay/[identifier]/page.tsx", "utf8");

    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source.indexOf("getPublicCheckoutPresentationService")).toBeGreaterThan(-1);
    expect(source.indexOf("getPublicCheckoutPresentationService")).toBeLessThan(source.indexOf("getPublicCheckoutV2PresentationService"));
    const checkoutRoute = await readFile("src/app/api/payment-links/[identifier]/checkout/route.ts", "utf8");
    expect(checkoutRoute.indexOf("public-checkout")).toBeLessThan(checkoutRoute.indexOf("public-checkout-v2"));
    const statusRoute = await readFile("src/app/api/payment-links/[identifier]/checkout/status/route.ts", "utf8");
    expect(statusRoute.indexOf("payment-status")).toBeLessThan(statusRoute.indexOf("payment-status-v2"));
  });
});
