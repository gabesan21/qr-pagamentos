import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SimpleTabs } from "./simple-tabs"

describe("SimpleTabs", () => {
  it("composes labelled Radix tabs, disabled state, counts, and panels", () => {
    const markup = renderToStaticMarkup(
      <SimpleTabs
        label="Order views"
        defaultValue="open"
        tabs={[
          { id: "open", label: "Open", count: 2, content: "Open orders" },
          { id: "closed", label: "Closed", content: "Closed orders", disabled: true },
        ]}
      />,
    )

    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('aria-label="Order views"')
    expect(markup).toContain('role="tab"')
    expect(markup).toContain('role="tabpanel"')
    expect(markup).toContain("Open orders")
    expect(markup).toContain("disabled")
    expect(markup).toContain('data-slot="badge"')
  })
})
