// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { replace, push } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));

import { DataDirectory, type DataDirectoryCopy } from "./data-directory";

type Row = { id: string; label: string };

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

const rows: Row[] = [{ id: "row-1", label: "Alpha" }, { id: "row-2", label: "Bravo" }];

const common = {
  idPrefix: "test-directory",
  copy,
  caption: "Synthetic rows",
  columns: [{ id: "label", label: "Label", value: (row: Row) => row.label }],
  rows,
  rowKey: (row: Row) => row.id,
  formAction: "/design-system",
  resetUrl: "/design-system",
};

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockClear();
  push.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DataDirectoryClient URL-state controller", () => {
  it("keeps collapsed controls in the GET form without navigating when the disclosure opens", () => {
    const { container } = render(
      <DataDirectory
        {...common}
        compactToolbar={{ visibleFilterNames: ["state"] }}
        copy={{ ...copy, additionalFilters: "More filters", creationPeriod: "Created between" }}
        filters={[
          { name: "state", label: "State", allLabel: "All states", options: [{ value: "ACTIVE", label: "Active" }] },
          { name: "role", label: "Role", allLabel: "All roles", options: [{ value: "USER", label: "User" }] },
        ]}
        state="ready"
        textFilters={[{ name: "from", label: "From", calendarDay: true }, { name: "to", label: "To", calendarDay: true }]}
      />,
    );

    const form = container.querySelector('form[method="get"]') as HTMLFormElement;
    const summary = container.querySelector("summary");
    expect(summary).not.toBeNull();
    const submitted = new FormData(form);
    expect(submitted.has("filter.from")).toBe(true);
    expect(submitted.has("filter.to")).toBe(true);

    fireEvent.click(summary as HTMLElement);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("State")).not.toBeNull();
    expect(screen.getByText("Role")).not.toBeNull();
  });

  it("commits a changed collapsed control and resets the cursor", () => {
    render(
      <DataDirectory
        {...common}
        compactToolbar={{ visibleFilterNames: ["state"] }}
        filters={[
          { name: "state", label: "State", allLabel: "All states", options: [{ value: "ACTIVE", label: "Active" }] },
          { name: "role", label: "Role", allLabel: "All roles", options: [{ value: "USER", label: "User" }] },
        ]}
        nextUrl="/design-system?cursor=next-token"
        state="ready"
      />,
    );

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "USER" } });
    expect(replace).toHaveBeenCalledWith("/design-system?filter.role=USER&pageSize=25", { scroll: false });
  });

  it("commits the search field only after the debounce delay elapses", () => {
    render(<DataDirectory {...common} state="ready" />);
    const search = screen.getByLabelText("Search") as HTMLInputElement;

    fireEvent.change(search, { target: { value: "coffee" } });
    expect(replace).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(349); });
    expect(replace).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(replace).toHaveBeenCalledWith("/design-system?q=coffee&pageSize=25", { scroll: false });
  });

  it("commits an enum filter change immediately, without waiting for the debounce", () => {
    render(
      <DataDirectory
        {...common}
        filters={[{ name: "status", label: "Status", allLabel: "All", options: [{ value: "ACTIVE", label: "Active" }] }]}
        state="ready"
      />,
    );
    const select = screen.getByLabelText("Status");

    fireEvent.change(select, { target: { value: "ACTIVE" } });
    expect(replace).toHaveBeenCalledWith("/design-system?filter.status=ACTIVE&pageSize=25", { scroll: false });
  });

  it("never emits a cursor field in the committed query", () => {
    render(
      <DataDirectory
        {...common}
        filters={[{ name: "status", label: "Status", allLabel: "All", options: [{ value: "ACTIVE", label: "Active" }] }]}
        nextUrl="/design-system?cursor=next-token"
        state="ready"
      />,
    );
    const select = screen.getByLabelText("Status");
    fireEvent.change(select, { target: { value: "ACTIVE" } });

    const [target] = replace.mock.calls[0] as [string, unknown];
    expect(target).not.toContain("cursor");
  });

  it("resolves chip labels from the registered enum option, never the raw value", () => {
    render(
      <DataDirectory
        {...common}
        canonicalFilterQuery="filter.status=ACTIVE"
        filters={[{ name: "status", label: "Status", allLabel: "All", options: [{ value: "ACTIVE", label: "Active only" }] }]}
        state="ready"
      />,
    );
    expect(screen.getByText("Status: Active only")).not.toBeNull();
    expect(screen.queryByText("Status: ACTIVE")).toBeNull();
  });

  it("resolves the search chip through the search label, and an unregistered text filter by its own key", () => {
    render(
      <DataDirectory
        {...common}
        canonicalFilterQuery="q=coffee&filter.link=abc123"
        state="ready"
      />,
    );
    expect(screen.getByText("Search: coffee")).not.toBeNull();
    expect(screen.getByText("filter.link: abc123")).not.toBeNull();
  });

  it("renders compact filter copy and clear-all beside removable chips", () => {
    render(
      <DataDirectory
        {...common}
        canonicalFilterQuery="filter.status=ACTIVE&filter.role=USER"
        compactToolbar={{ visibleFilterNames: ["status"] }}
        copy={{
          ...copy,
          additionalFilters: "More filters",
          additionalFiltersActive: "{count} active additional filters",
          clearFilters: "Clear all",
          creationPeriod: "Created between",
        }}
        filters={[
          { name: "status", label: "Status", allLabel: "All", selected: "ACTIVE", options: [{ value: "ACTIVE", label: "Active" }] },
          { name: "role", label: "Role", allLabel: "All", selected: "USER", options: [{ value: "USER", label: "User" }] },
        ]}
        state="ready"
      />,
    );
    expect(screen.getByText("More filters")).not.toBeNull();
    expect(screen.getByLabelText("1 active additional filters")).not.toBeNull();
    expect(screen.getByText("Clear all")).not.toBeNull();
    expect(screen.getByText("Status: Active")).not.toBeNull();
  });
});

describe("DataDirectoryClient row navigation", () => {
  it("navigates to the row href on a plain row click", () => {
    const { container } = render(<DataDirectory {...common} getRowHref={(row) => `/rows/${row.id}`} state="ready" />);
    const table = container.querySelector('[role="region"]') as HTMLElement;
    const cell = within(table).getByText("Alpha");
    fireEvent.click(cell.closest("tr") as HTMLElement);
    expect(push).toHaveBeenCalledWith("/rows/row-1");
  });

  it("does not navigate when the click lands on an interactive descendant", () => {
    const { container } = render(
      <DataDirectory
        {...common}
        actionsLabel="Actions"
        getRowActions={(row) => <button type="button">{`Open ${row.id}`}</button>}
        getRowHref={(row) => `/rows/${row.id}`}
        state="ready"
      />,
    );
    const table = container.querySelector('[role="region"]') as HTMLElement;
    fireEvent.click(within(table).getByRole("button", { name: "Open row-1" }));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("DataDirectoryClient pending footer", () => {
  it("keeps the page-size control mounted while a commit is pending", () => {
    render(
      <DataDirectory
        {...common}
        filters={[{ name: "status", label: "Status", allLabel: "All", options: [{ value: "ACTIVE", label: "Active" }] }]}
        state="ready"
      />,
    );
    const select = screen.getByLabelText("Status");
    fireEvent.change(select, { target: { value: "ACTIVE" } });

    // The commit went through `startTransition`; the page-size control from
    // the footer must still be present in the document, not unmounted by the
    // transitional "loading" state it triggers.
    expect(screen.getByLabelText("Rows")).not.toBeNull();
  });
});
