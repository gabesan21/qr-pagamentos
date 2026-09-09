import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Pins C03.a for real: mocks the two form components so the assertion can
// only be satisfied by the page actually passing `merchantIdentity` into
// them — the shell header alone (which both pages also render) cannot
// satisfy it, unlike an assertion made on the rendered payment-phase markup.
const { get } = vi.hoisted(() => ({ get: vi.fn(() => undefined) }));
const { read, readV2 } = vi.hoisted(() => ({ read: vi.fn(), readV2: vi.fn() }));
const { capturedV1Identity, capturedV2Identity } = vi.hoisted(() => ({ capturedV1Identity: { current: undefined as unknown }, capturedV2Identity: { current: undefined as unknown } }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get }) }));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve: vi.fn() }) }));
vi.mock("@/checkout/public-checkout-presentation", () => ({ getPublicCheckoutPresentationService: () => ({ read }) }));
vi.mock("@/checkout/public-checkout-v2-presentation", () => ({ getPublicCheckoutV2PresentationService: () => ({ read: readV2 }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: vi.fn() }) }));
vi.mock("./public-checkout-form", () => ({
  PublicCheckoutForm: (props: { merchantIdentity?: unknown }) => {
    capturedV1Identity.current = props.merchantIdentity;
    return null;
  },
}));
vi.mock("./public-checkout-v2-form", () => ({
  PublicCheckoutV2Form: (props: { merchantIdentity?: unknown }) => {
    capturedV2Identity.current = props.merchantIdentity;
    return null;
  },
}));

import PublicCheckoutPage from "./page";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";
const branding = { displayName: "Ana's Shop", accentColor: "#125448", themeId: "vault-blue", logoMediaIdentifier: "logo-media-identifier-00000000000000000" };

describe("public checkout page identity wiring (C03.a)", () => {
  it("feeds the V1 page's resolved branding into PublicCheckoutForm's merchantIdentity prop", async () => {
    read.mockResolvedValueOnce({ product: { title: "Donation", description: "Support the project.", price: "12.50" }, checkoutPolicy: "NONE", branding });
    renderToStaticMarkup(await PublicCheckoutPage({ params: Promise.resolve({ identifier }) }));

    expect(capturedV1Identity.current).not.toBeUndefined();
    const identityMarkup = renderToStaticMarkup(capturedV1Identity.current as React.ReactElement);
    expect(identityMarkup).toContain("/media/logo-media-identifier-00000000000000000");
  });

  it("feeds the V2 checkout page's resolved branding into PublicCheckoutV2Form's merchantIdentity prop", async () => {
    read.mockResolvedValueOnce(null);
    readV2.mockResolvedValueOnce({
      kind: "checkout",
      presentation: {
        composition: { kind: "FIXED_AMOUNT", description: "Monthly donation", amount: "10.50" },
        currencyCode: null,
        checkoutPolicy: "NONE",
        branding,
      },
    });
    renderToStaticMarkup(await PublicCheckoutPage({ params: Promise.resolve({ identifier }) }));

    expect(capturedV2Identity.current).not.toBeUndefined();
    const identityMarkup = renderToStaticMarkup(capturedV2Identity.current as React.ReactElement);
    expect(identityMarkup).toContain("/media/logo-media-identifier-00000000000000000");
  });
});
