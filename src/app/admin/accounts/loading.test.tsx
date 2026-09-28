import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import AdminAccountsLoading from "./loading";

it("renders the compact accounts directory fallback", () => {
  const markup = renderToStaticMarkup(<AdminAccountsLoading />);
  expect(markup).toContain('aria-label="Loading accounts"');
  expect(markup).toContain('aria-busy="true"');
});
