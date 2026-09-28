import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import AdminPaymentLinksLoading from "./loading";

it("renders the compact payment-link directory fallback", () => {
  const markup = renderToStaticMarkup(<AdminPaymentLinksLoading />);
  expect(markup).toContain('aria-label="Loading payment links"');
  expect(markup).toContain('aria-busy="true"');
});
