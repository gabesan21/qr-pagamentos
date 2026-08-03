import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Monogram } from "./monogram";

describe("Monogram", () => {
  it("derives at most two initials and stays decorative by default", () => {
    const markup = renderToStaticMarkup(<Monogram name="ana-maria silva" />);

    expect(markup).toContain("AM");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("AMS");
  });

  it("supports a named image with a deterministic fallback", () => {
    const markup = renderToStaticMarkup(
      <Monogram accessibleName="Merchant avatar" imageUrl="/media/avatar.svg" name="QR Pagamentos" size="lg" />,
    );

    expect(markup).toContain('aria-label="Merchant avatar"');
    expect(markup).toContain('role="img"');
    expect(markup).toContain("/media/avatar.svg");
    expect(markup).toContain("QP");
  });
});
