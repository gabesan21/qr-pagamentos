import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
const { read, resolve, resolveLocale } = vi.hoisted(() => ({ read: vi.fn(), resolve: vi.fn(), resolveLocale: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get }) }));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve }) }));
vi.mock("@/checkout/public-checkout-presentation", () => ({ getPublicCheckoutPresentationService: () => ({ read }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));

import PublicCheckoutPage from "./page";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";

describe("public checkout page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the exact projection with policy-driven fields and shared primitives", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce({ product: { title: "Donation", description: "Support the project.", price: "12.50" }, checkoutPolicy: "NAME_EMAIL_CPF_ADDRESS" });
    const markup = renderToStaticMarkup(await PublicCheckoutPage({ params: Promise.resolve({ identifier }) }));

    expect(read).toHaveBeenCalledWith(identifier, "pt-BR");
    expect(markup).toContain("Donation");
    expect(markup).toContain('for="checkout-name"');
    expect(markup).toContain('for="checkout-email"');
    expect(markup).toContain('for="checkout-cpf"');
    expect(markup).toContain('for="checkout-street"');
    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="field-set"');
    expect(markup).not.toContain("currencyUuid");
  });

  it("renders a generic unavailable state without a form", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce(null);
    const markup = renderToStaticMarkup(await PublicCheckoutPage({ params: Promise.resolve({ identifier }) }));

    expect(markup).toContain("Este link de pagamento está indisponível");
    expect(markup).not.toContain('data-slot="field-group"');
  });

  it("uses the persisted UI locale instead of Accept-Language when a principal is present", async () => {
    get.mockReturnValue({ value: "session-token" });
    resolve.mockResolvedValueOnce({ id: "account-id" });
    resolveLocale.mockResolvedValueOnce("en");
    read.mockResolvedValueOnce({ product: { title: "Donation", description: "Support the project.", price: "12.50" }, checkoutPolicy: "NONE" });

    await PublicCheckoutPage({ params: Promise.resolve({ identifier }) });

    expect(resolve).toHaveBeenCalledWith("session-token");
    expect(resolveLocale).toHaveBeenCalledWith("account-id");
    expect(read).toHaveBeenCalledWith(identifier, "en");
  });
});
