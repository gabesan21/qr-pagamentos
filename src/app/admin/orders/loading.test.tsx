import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import AdminOrdersLoading from "./loading";

it("renders the compact orders directory fallback", () => {
  const markup = renderToStaticMarkup(<AdminOrdersLoading />);
  expect(markup).toContain('aria-label="Loading orders"');
  expect(markup).toContain('aria-busy="true"');
});
