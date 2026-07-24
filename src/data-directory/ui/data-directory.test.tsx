import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DataDirectory, type DataDirectoryCopy } from "./data-directory";

type Row = { id: string; label: string; amount: string };
const copy: DataDirectoryCopy = {
  searchLabel: "Search",
  searchPlaceholder: "Reference",
  pageSizeLabel: "Rows",
  applyFilters: "Apply",
  resetFilters: "Reset",
  previousPage: "Previous",
  nextPage: "Next",
  paginationLabel: "Pages",
  loading: "Loading",
  loadingDescription: "Preparing rows",
  empty: "Empty",
  emptyDescription: "Nothing yet",
  filteredEmpty: "No matches",
  filteredEmptyDescription: "Clear filters",
  invalid: "Unavailable",
  invalidDescription: "Reset without echoed values",
  error: "Failed",
  errorDescription: "No internal detail",
  retry: "Retry",
};
const common = {
  idPrefix: "test-directory",
  copy,
  caption: "Synthetic rows",
  columns: [
    { id: "label", label: "Label", value: (row: Row) => row.label },
    { id: "amount", label: "Amount", value: (row: Row) => row.amount, numeric: true },
  ],
  rows: [{ id: "row-1", label: "Alpha", amount: "10.00" }],
  rowKey: (row: Row) => row.id,
  formAction: "/design-system",
  resetUrl: "/design-system",
};

describe("DataDirectory", () => {
  it("renders a labelled cursor-free native GET toolbar and canonical links", () => {
    const html = renderToStaticMarkup(
      <DataDirectory
        {...common}
        filters={[{ name: "status", label: "Status", allLabel: "All", options: [{ value: "ACTIVE", label: "Active" }] }]}
        nextUrl="/design-system?pageSize=50&cursor=next"
        pageSize={50}
        previousUrl="/design-system?pageSize=50&cursor=previous"
        state="ready"
      />,
    );
    expect(html).toContain('method="get"');
    expect(html).toContain('name="q"');
    expect(html).toContain('name="filter.status"');
    expect(html).toContain('name="pageSize"');
    expect(html).not.toContain('name="cursor"');
    expect(html).toContain('aria-label="Pages"');
    expect(html).toContain("<caption");
    expect(html).toContain("<dl");
  });

  it("keeps exactly one responsive renderer visible by CSS contract", () => {
    const html = renderToStaticMarkup(<DataDirectory {...common} state="ready" />);
    expect(html).toContain('class="hidden md:block"');
    expect(html).toContain("md:hidden");
    expect(html).toContain('scope="col"');
    expect(html).toContain("tabular-nums");
  });

  it.each(["loading", "empty", "filtered-empty", "invalid-query", "error"] as const)(
    "renders the closed %s state without business or exception detail",
    (state) => {
      const html = renderToStaticMarkup(<DataDirectory {...common} state={state} />);
      expect(html).toContain(`data-directory-state="${state}"`);
      expect(html).not.toContain("ownerId");
      expect(html).not.toContain("stack");
      if (state === "loading") {
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain('aria-live="polite"');
      }
    },
  );

  it("renders at most one primary action in the toolbar", () => {
    const html = renderToStaticMarkup(<DataDirectory {...common} state="empty" emptyAction={{ href: "/new", label: "Create" }} />);
    expect(html.match(/data-variant="default"/g)).toHaveLength(1);
  });

  it("has no business store, auth service, theme, or role branch import", () => {
    const source = readFileSync(new URL("./data-directory.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/@\/(?:auth|orders|checkout|media|storefront|app\/admin)/u);
    expect(source).not.toMatch(/data-theme|principal|ownerId|ADMIN|USER/u);
  });
});
