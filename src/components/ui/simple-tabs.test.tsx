// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"

import { SimpleTabs } from "./simple-tabs"

afterEach(cleanup)

describe("SimpleTabs", () => {
  it("selects enabled tabs with arrow keys without selecting disabled tabs", async () => {
    const user = userEvent.setup()
    render(
      <SimpleTabs
        label="Order views"
        defaultValue="open"
        tabs={[
          { id: "open", label: "Open", count: 2, content: "Open orders" },
          { id: "closed", label: "Closed", content: "Closed orders", disabled: true },
          { id: "archived", label: "Archived", content: "Archived orders" },
        ]}
      />,
    )

    const openTab = screen.getByRole("tab", { name: /Open/ })
    openTab.focus()
    await user.keyboard("{ArrowRight}")

    const archivedTab = screen.getByRole("tab", { name: "Archived" })
    expect(document.activeElement).toBe(archivedTab)
    expect(archivedTab.getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tabpanel").textContent).toContain("Archived orders")
    expect(screen.getByRole("tab", { name: "Closed" }).hasAttribute("disabled")).toBe(true)
  })
})
