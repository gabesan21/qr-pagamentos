import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CardSkeleton, CheckoutSkeleton, DetailSkeleton, StatGridSkeleton, TableSkeleton } from "./skeletons";

describe("shared skeleton compositions", () => {
  it("labels every loading region and marks it busy", () => {
    for (const component of [
      <CardSkeleton key="card" label="Loading card" />,
      <CheckoutSkeleton key="checkout" label="Loading checkout" />,
      <DetailSkeleton key="detail" label="Loading details" />,
      <StatGridSkeleton key="stats" label="Loading statistics" />,
      <TableSkeleton key="table" label="Loading results" />,
    ]) {
      const markup = renderToStaticMarkup(component);
      expect(markup).toContain('role="status"');
      expect(markup).toContain('aria-busy="true"');
      expect(markup).toMatch(/aria-label="Loading /u);
    }
  });

  it("bounds caller-provided collection geometry", () => {
    const markup = renderToStaticMarkup(<TableSkeleton columns={100} label="Loading results" rows={100} />);
    expect(markup.match(/data-slot="skeleton"/gu)).toHaveLength(144);
  });
});
