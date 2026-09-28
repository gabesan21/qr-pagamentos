import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CatalogLoading from "./catalog/loading";
import LinksLoading from "./links/loading";
import OrdersLoading from "./orders/loading";

describe("merchant directory loading routes", () => {
  it.each([
    ["orders", OrdersLoading, "Loading orders"],
    ["payment links", LinksLoading, "Loading payment links"],
    ["catalog", CatalogLoading, "Loading products"],
  ] as const)("uses the shared directory skeleton for %s", (_directory, Loading, label) => {
    const markup = renderToStaticMarkup(<Loading />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain(`aria-label="${label}"`);
    expect(markup).toContain('aria-busy="true"');
  });
});
