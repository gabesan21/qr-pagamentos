import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CopyField } from "./copy-field"

const source = readFileSync(new URL("./copy-field.tsx", import.meta.url), "utf8")

describe("CopyField", () => {
  it("renders the supplied value and localized accessible copy label", () => {
    const markup = renderToStaticMarkup(
      <CopyField
        value="000201010212"
        labels={{
          copy: "Copy PIX code",
          pending: "Copying PIX code",
          copied: "PIX code copied",
          failed: "Copy failed. Try again.",
        }}
      />,
    )

    expect(markup).toContain("000201010212")
    expect(markup).toContain('aria-label="Copy PIX code"')
    expect(markup).toContain('role="status"')
  })

  it("uses the clipboard API in the click handler with pending, success, and retryable failure", () => {
    expect(source).toContain("async function handleCopy()")
    expect(source).toContain("navigator.clipboard?.writeText")
    expect(source).toContain('setState("pending")')
    expect(source).toContain('setState("copied")')
    expect(source).toContain('setState("failed")')
    expect(source).toContain('state === "failed" ? "alert" : "status"')
    expect(source).not.toContain("execCommand")
    expect(source).not.toContain("createElement")
  })
})
