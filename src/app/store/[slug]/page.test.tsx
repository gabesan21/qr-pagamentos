import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
const { read, resolve, resolveLocale } = vi.hoisted(() => ({ read: vi.fn(), resolve: vi.fn(), resolveLocale: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get }) }));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/storefront/public-storefront", () => ({ getPublicStorefrontService: () => ({ read }) }));

import PublicStorefrontPage from "./page";

describe("public storefront page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only the public projection and navigates to its selected checkout link", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce({
      displayName: "Loja da Ana",
      accentColor: "#106B5B",
      products: [{ title: "Café", description: "Café especial.", price: "12.50", paymentLinkIdentifier: "AbCdEfGhIjKlMnOpQrStUvWx" }],
    });

    const markup = renderToStaticMarkup(await PublicStorefrontPage({ params: Promise.resolve({ slug: "ana-store" }) }));

    expect(read).toHaveBeenCalledWith("ana-store", "pt-BR");
    expect(markup).toContain("Loja da Ana");
    expect(markup).toContain('href="/pay/AbCdEfGhIjKlMnOpQrStUvWx"');
    expect(markup).toContain('style="--storefront-accent:#106B5B"');
    expect(markup).not.toContain("ownerId");
    expect(markup).not.toContain("checkoutDataPolicy");
  });

  it("uses the persisted locale and displays an enabled storefront with no eligible products as empty", async () => {
    get.mockReturnValue({ value: "session-token" });
    resolve.mockResolvedValueOnce({ id: "account-id" });
    resolveLocale.mockResolvedValueOnce("en");
    read.mockResolvedValueOnce({ displayName: null, accentColor: null, products: [] });

    const markup = renderToStaticMarkup(await PublicStorefrontPage({ params: Promise.resolve({ slug: "ana-store" }) }));

    expect(read).toHaveBeenCalledWith("ana-store", "en");
    expect(markup).toContain("QR Pagamentos storefront");
    expect(markup).toContain("No products are available right now.");
  });

  it("uses one opaque unavailable state for unknown, disabled, and malformed storefronts", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce(null);

    const markup = renderToStaticMarkup(await PublicStorefrontPage({ params: Promise.resolve({ slug: "unknown" }) }));

    expect(markup).toContain("This storefront is unavailable");
    expect(markup).not.toContain('href="/pay/');
  });
});
