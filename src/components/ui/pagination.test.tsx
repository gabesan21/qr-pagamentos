import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

import { PaginationNext, PaginationPrevious } from "./pagination";

const focusOutline =
  "focus-visible:[outline:var(--focus-width)_solid_var(--color-focus-ring)]";
const focusOffset =
  "focus-visible:[outline-offset:var(--focus-offset)]";

describe("pagination link focus", () => {
  it("projects the measured semantic focus contract onto both cursor links", async () => {
    const previousMarkup = renderToStaticMarkup(
      <PaginationPrevious
        href="?cursor=previous"
        label="Previous results"
        text="Previous"
      />,
    );
    const nextMarkup = renderToStaticMarkup(
      <PaginationNext
        href="?cursor=next"
        label="Next results"
        text="Next"
      />,
    );

    for (const markup of [previousMarkup, nextMarkup]) {
      expect(markup).toContain('data-slot="pagination-link"');
      expect(markup).toContain("min-h-11");
      expect(markup).toContain("focus-visible:ring-3");
      expect(markup).toContain(
        "focus-visible:ring-[var(--color-focus-ring)]",
      );
      expect(markup).toContain(focusOutline);
      expect(markup).toContain(focusOffset);
    }
    expect(previousMarkup).toContain("lucide-chevron-left");
    expect(previousMarkup).toContain('data-icon="inline-start"');
    expect(nextMarkup).toContain("lucide-chevron-right");
    expect(nextMarkup).toContain('data-icon="inline-end"');

    const globals = readFileSync(
      new URL("../../app/globals.css", import.meta.url),
      "utf8",
    );
    expect(globals).toContain("--focus-width: 3px;");
    expect(globals).toContain("--focus-color: var(--color-focus-ring);");
    expect(globals).toContain('a[data-slot="button"]:focus-visible');
    expect(globals).not.toContain('a[data-slot="pagination-link"]:focus-visible');

    const compiler = await compile("@tailwind utilities;");
    const css = compiler.build([focusOutline, focusOffset]);
    expect(css).toContain(
      "outline: var(--focus-width) solid var(--color-focus-ring);",
    );
    expect(css).toContain("outline-offset: var(--focus-offset);");
  });
});
