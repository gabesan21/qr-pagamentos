// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";
import type { PublicCheckoutV2Branding } from "@/checkout/public-checkout-v2-presentation";

import { CheckoutShell } from "./checkout-shell";

function render(branding?: PublicCheckoutV2Branding) {
  return renderToStaticMarkup(
    <CheckoutShell branding={branding} dictionary={dictionary} locale="en">
      <p>content</p>
    </CheckoutShell>,
  );
}

describe("checkout shell", () => {
  it("caps the column at the 560px checkout token and always renders the footer with the language switcher", () => {
    const markup = render();
    expect(markup).toContain("max-w-checkout");
    expect(markup).toContain(dictionary.checkoutPoweredBy);
    expect(markup).toContain(dictionary.languageLabel);
  });

  it("renders no merchant header when branding is absent (unavailable/loading/error views)", () => {
    const markup = render();
    expect(markup).not.toContain(dictionary.checkoutTrustLine);
  });

  it("prefers the owner-activated logo over the Monogram over the merchant fallback", () => {
    const withLogo = render({ displayName: "Ana's Shop", accentColor: "#125448", themeId: "vault-blue", logoMediaIdentifier: "logo-media-identifier-00000000000000000" });
    expect(withLogo).toContain("/media/logo-media-identifier-00000000000000000");
    expect(withLogo).toContain("Ana&#x27;s Shop");

    const withNameOnly = render({ displayName: "Ana's Shop", accentColor: null, themeId: "pix-paper", logoMediaIdentifier: null });
    expect(withNameOnly).not.toContain("/media/");
    expect(withNameOnly).toContain("Ana&#x27;s Shop");

    const withNeither = render({ displayName: null, accentColor: null, themeId: "pix-paper", logoMediaIdentifier: null });
    expect(withNeither).not.toContain("/media/");
    expect(withNeither).toContain('data-brand-identity="merchant-fallback"');
    expect(withNeither).toContain(dictionary.storefrontFallbackName);
  });

  it("binds the theme preview and the accent custom property from branding", () => {
    const markup = render({ displayName: "Ana's Shop", accentColor: "#125448", themeId: "vault-blue", logoMediaIdentifier: null });
    expect(markup).toContain('data-theme-preview="vault-blue"');
    expect(markup).toContain("--storefront-accent:#125448");
  });

  it("widens the column and lays out a horizontal header for the storefront variant only", () => {
    const branding: PublicCheckoutV2Branding = { displayName: "Ana's Shop", accentColor: null, themeId: "pix-paper", logoMediaIdentifier: null };
    const storefront = renderToStaticMarkup(
      <CheckoutShell branding={branding} dictionary={dictionary} locale="en" variant="storefront">
        <p>content</p>
      </CheckoutShell>,
    );
    expect(storefront).toContain("max-w-app");
    expect(storefront).not.toContain("max-w-checkout");
    expect(storefront).toContain("Ana&#x27;s Shop");
    expect(storefront).toContain(dictionary.checkoutTrustLine);
    expect(storefront).toContain("border-border");

    const checkout = render(branding);
    expect(checkout).toContain("max-w-checkout");
    expect(checkout).not.toContain("max-w-app");
    expect(checkout).not.toContain("border-border");
  });
});
