import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders localized content, the approved asset, and recovery content", () => {
    const markup = renderToStaticMarkup(
      <EmptyState
        action={<a href="?reset=1">Clear filters</a>}
        body="Try another filter."
        illustration="orders"
        kind="filtered-empty"
        title="No matching orders"
      />,
    );

    expect(markup).toContain('data-state="filtered-empty"');
    expect(markup).toContain("/application-assets/empty-orders.svg");
    expect(markup).toContain("No matching orders");
    expect(markup).toContain("Clear filters");
  });

  it("uses alert semantics only for an error", () => {
    expect(renderToStaticMarkup(<EmptyState kind="error" title="Could not load" />)).toContain('role="alert"');
    expect(renderToStaticMarkup(<EmptyState title="No results" />)).toContain('role="status"');
  });

  it("offers a dashboard-scoped compact composition without changing the default", () => {
    const compact = renderToStaticMarkup(<EmptyState illustration="users" size="compact" title="No ranked accounts" />);
    const standard = renderToStaticMarkup(<EmptyState illustration="users" title="No ranked accounts" />);

    expect(compact).toContain("py-6");
    expect(compact).toContain('height="120"');
    expect(standard).toContain("py-12");
    expect(standard).toContain('height="192"');
  });
});
