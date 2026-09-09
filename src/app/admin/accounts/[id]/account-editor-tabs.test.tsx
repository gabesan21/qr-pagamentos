// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SimpleTab } from "@/components/ui/simple-tabs";

import { AccountEditorTabs } from "./account-editor-tabs";

afterEach(cleanup);

const tabs: readonly SimpleTab[] = [
  { id: "identity", label: "Identity", content: <p>Identity panel</p> },
  { id: "access", label: "Access", content: <p>Access panel</p> },
  { id: "storefront", label: "Storefront", content: <p>Storefront panel</p> },
];

beforeEach(() => {
  window.history.replaceState(null, "", "/admin/accounts/target");
});

describe("account editor tab persistence", () => {
  it("defaults to the first tab when the URL carries no hash", () => {
    render(<AccountEditorTabs ariaLabel="Profile sections" tabs={tabs} />);
    expect(screen.getByText("Identity panel")).not.toBeNull();
  });

  it("restores the active tab from the URL hash once at mount", () => {
    window.history.replaceState(null, "", "/admin/accounts/target#storefront");
    render(<AccountEditorTabs ariaLabel="Profile sections" tabs={tabs} />);
    expect(screen.getByText("Storefront panel")).not.toBeNull();
  });

  it("ignores an unknown hash and keeps the first tab", () => {
    window.history.replaceState(null, "", "/admin/accounts/target#not-a-tab");
    render(<AccountEditorTabs ariaLabel="Profile sections" tabs={tabs} />);
    expect(screen.getByText("Identity panel")).not.toBeNull();
  });

  it("rewrites the hash via history.replaceState on every switch, never a new history entry", async () => {
    const user = userEvent.setup();
    render(<AccountEditorTabs ariaLabel="Profile sections" tabs={tabs} />);

    await user.click(screen.getByRole("tab", { name: "Access" }));

    expect(screen.getByText("Access panel")).not.toBeNull();
    expect(window.location.hash).toBe("#access");
  });
});
