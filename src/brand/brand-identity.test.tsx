import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BrandIdentity } from "./brand-identity";

describe("brand identity", () => {
  it("hides a mark that is adjacent to the visible product name", () => {
    const markup = renderToStaticMarkup(<BrandIdentity variant="product-lockup" />);

    expect(markup).toContain('data-brand-identity="product-lockup"');
    expect(markup).toContain("QR Pagamentos");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("<title");
  });

  it("gives a standalone meaningful mark exactly one accessible name", () => {
    const markup = renderToStaticMarkup(
      <BrandIdentity accessibleName="QR Pagamentos" variant="mark-only" />,
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="QR Pagamentos"');
    expect(markup).not.toContain("aria-hidden");
    expect(markup).not.toContain("<title");
  });

  it.each(["compact-role-lockup", "merchant-fallback"] as const)(
    "keeps the %s composition explicit",
    (variant) => {
      const markup = renderToStaticMarkup(<BrandIdentity variant={variant} />);

      expect(markup).toContain(`data-brand-identity="${variant}"`);
      expect(markup).toContain("QR Pagamentos");
    },
  );
});
