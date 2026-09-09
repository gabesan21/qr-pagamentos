// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";
import type { PublicCheckoutBranding } from "@/checkout/public-checkout-presentation";

import { CheckoutShell } from "./checkout-shell";

function render(branding?: PublicCheckoutBranding) {
  return renderToStaticMarkup(
    <CheckoutShell branding={branding} dictionary={dictionary} locale="en">
      <p>content</p>
    </CheckoutShell>,
  );
}

describe("checkout shell", () => {
  it("caps the column at the 560px checkout token and always renders the footer with the language switcher", () => {
    const markup = render();
    expect(markup).toContain("max-w-[var(--checkout-max)]");
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
});
