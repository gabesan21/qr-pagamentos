import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PaginationPrevious } from "./pagination";

describe("PaginationPrevious", () => {
  it("binds its three-pixel focus ring to the measured semantic color", () => {
    const markup = renderToStaticMarkup(
      <PaginationPrevious
        href="?cursor=previous"
        label="Previous results"
        text="Previous"
      />,
    );

    expect(markup).toContain("min-h-11");
    expect(markup).toContain("focus-visible:ring-3");
    expect(markup).toContain(
      "focus-visible:ring-[var(--color-focus-ring)]",
    );
    expect(markup).toContain("lucide-chevron-left");
    expect(markup).toContain('data-icon="inline-start"');
  });
});
