import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { StorefrontPreview, type StorefrontPreviewProps } from "./storefront-preview";

const props: StorefrontPreviewProps = {
  accentColor: "#1A2B3C",
  displayName: "Minha Loja",
  fallbackAlt: "QR Pagamentos placeholder logo",
  heading: "Storefront preview",
  layout: "boxed",
  logoAlt: "Your storefront logo",
  logoMediaIdentifier: null,
  priceLabel: "Price",
  productsHeading: "Products",
  sampleAction: "Continue to payment",
  sampleDescription: "Sample description",
  samplePrice: "R$ 49.90",
  sampleTitle: "Sample product",
  themeId: "vault-blue",
};

function render(overrides: Readonly<Partial<StorefrontPreviewProps>> = {}) {
  return renderToStaticMarkup(<StorefrontPreview {...props} {...overrides} />);
}

describe("storefront preview", () => {
  it("scopes the chosen theme and declares only the validated accent custom property", () => {
    const markup = render();
    expect(markup).toContain('data-theme-preview="vault-blue"');
    expect(markup).toContain("--storefront-accent:#1A2B3C");
    const withoutAccent = render({ accentColor: null });
    expect(withoutAccent).not.toContain("--storefront-accent");
  });

  it("renders the official merchant fallback lockup when no logo is set, never a page-local mark", () => {
    const markup = render();
    expect(markup).toContain('data-brand-identity="merchant-fallback"');
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="QR Pagamentos placeholder logo"');
    expect(markup).not.toContain("/media/");
  });

  it("renders the staged or stored logo through the media read route with a localized alt", () => {
    const identifier = "l".repeat(43);
    const markup = render({ logoMediaIdentifier: identifier });
    expect(markup).toContain(`src="/media/${identifier}"`);
    expect(markup).toContain('alt="Your storefront logo"');
    expect(markup).not.toContain("merchant-fallback");
  });

  it("swaps between the boxed card and the table row arrangements", () => {
    const boxed = render();
    expect(boxed).toContain('data-layout="boxed"');
    expect(boxed).toContain("storefront-preview__card");
    expect(boxed).not.toContain("<table");
    const table = render({ layout: "table" });
    expect(table).toContain('data-layout="table"');
    expect(table).toContain("<table");
    expect(table).toContain("Products");
    expect(table).toContain("Price");
  });

  it("keeps the sample action inert and labelled as preview fixture copy", () => {
    const markup = render();
    expect(markup).toContain("Continue to payment");
    expect(markup).not.toContain('data-slot="button" type="submit"');
    expect(markup).toContain('aria-labelledby="storefront-preview-heading"');
    expect(markup).toContain("Minha Loja");
  });
});
