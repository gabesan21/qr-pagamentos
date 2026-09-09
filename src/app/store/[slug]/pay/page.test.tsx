import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
const { read, resolve, resolveLocale } = vi.hoisted(() => ({ read: vi.fn(), resolve: vi.fn(), resolveLocale: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get }) }));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/storefront/public-storefront", () => ({ getPublicStorefrontService: () => ({ read }) }));

import StandalonePaymentPage from "./page";

const storefront = {
  displayName: "Loja da Ana",
  accentColor: "#106B5B",
  themeId: "vault-blue",
  layout: "boxed",
  logoMediaIdentifier: null,
  products: [],
  catalog: [],
  standalonePayments: true,
  standalonePaymentCurrencyCode: "BRL",
  checkoutDataPolicy: "NAME_EMAIL_CPF",
} as const;

function renderPage(storefrontValue: unknown, amount?: string) {
  read.mockResolvedValueOnce(storefrontValue);
  return StandalonePaymentPage({
    params: Promise.resolve({ slug: "ana-store" }),
    searchParams: Promise.resolve(amount === undefined ? {} : { amount }),
  }).then((page) => renderToStaticMarkup(page));
}

describe("standalone payment page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the owner theme and accent, renders the policy-exact form, and prefills a valid amount", async () => {
    get.mockReturnValue(undefined);

    const markup = await renderPage(storefront, "12.5");

    expect(read).toHaveBeenCalledWith("ana-store", "pt-BR");
    expect(markup).toContain('data-theme-preview="vault-blue"');
    expect(markup).toContain('style="--storefront-accent:#106B5B"');
    expect(markup).toContain("Loja da Ana");
    // No logo but a display name: 14.6.1's header renders the `Monogram`
    // initials, not the merchant-fallback mark (14.6.2 F02, C1).
    expect(markup).not.toContain('data-brand-identity="merchant-fallback"');
    expect(markup).toContain(">LD<");
    expect(markup).toContain("Informe o valor e seus dados para pagar esta loja.");
    expect(markup).toContain("Valor (BRL)");
    expect(markup).toContain('value="12.5"');
    // NAME_EMAIL_CPF renders exactly name, email, and CPF.
    expect(markup).toContain('id="standalone-name"');
    expect(markup).toContain('id="standalone-email"');
    expect(markup).toContain('id="standalone-cpf"');
    expect(markup).not.toContain('id="standalone-street"');
    // The return link is present from the start.
    expect(markup).toContain('href="/store/ana-store"');
    expect(markup).toContain("Voltar para a loja");
    // Redaction: no owner, provider, policy, toggle, or internal field leaks.
    for (const forbidden of ["ownerId", "checkoutDataPolicy", "NAME_EMAIL_CPF", "standalonePaymentsEnabled", "credential", "provider"]) {
      expect(markup).not.toContain(forbidden);
    }
  });

  it("ignores an invalid prefill amount and revalidates it client-side", async () => {
    get.mockReturnValue(undefined);

    const markup = await renderPage(storefront, "abc");

    expect(markup).not.toContain('value="abc"');
    expect(markup).toContain('id="standalone-amount"');
  });

  it("renders no customer fields under the NONE policy", async () => {
    get.mockReturnValue(undefined);

    const markup = await renderPage({ ...storefront, checkoutDataPolicy: "NONE" });

    expect(markup).toContain("Este pagamento não exige dados do cliente.");
    expect(markup).not.toContain('id="standalone-name"');
    expect(markup).not.toContain('id="standalone-email"');
  });

  it("uses one opaque unavailable view for an unknown slug and for standalone payments off", async () => {
    get.mockReturnValue(undefined);

    const unknown = await renderPage(null);
    expect(unknown).toContain("Esta vitrine está indisponível");
    expect(unknown).not.toContain('data-theme-preview');
    expect(unknown).not.toContain('id="standalone-amount"');
    expect(unknown).toContain('href="/store/ana-store"');

    const off = await renderPage({ ...storefront, standalonePayments: false });
    expect(off).toContain("Esta vitrine está indisponível");
    expect(off).not.toContain('id="standalone-amount"');
    expect(off).not.toContain("Nenhum produto está disponível");
  });

  it("uses the persisted locale for an authenticated visitor", async () => {
    get.mockReturnValue({ value: "session-token" });
    resolve.mockResolvedValueOnce({ id: "account-id" });
    resolveLocale.mockResolvedValueOnce("en");

    const markup = await renderPage(storefront);

    expect(read).toHaveBeenCalledWith("ana-store", "en");
    expect(markup).toContain("Enter the amount and your details to pay this store.");
    expect(markup).toContain("Back to the store");
  });
});
