import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync(new URL("./modal.tsx", import.meta.url), "utf8")

describe("Modal and ConfirmDialog", () => {
  it("delegates focus, keyboard dismissal, and restoration to official Radix owners", () => {
    expect(source).toContain("<Dialog open={open} onOpenChange={handleOpenChange}>")
    expect(source).toContain("<DialogTitle>{title}</DialogTitle>")
    expect(source).toContain("onEscapeKeyDown")
    expect(source).toContain("onPointerDownOutside")
    expect(source).toContain("event.preventDefault()")
    expect(source).not.toMatch(/addEventListener|querySelector|document\./u)
  })

  it("keeps failed confirmation open and prevents duplicate submission", () => {
    expect(source).toContain("if (pending || !confirmationMatches)")
    expect(source).toContain("await onConfirm()")
    expect(source).toContain("onOpenChange(false)")
    expect(source).toContain("setFailure(true)")
    expect(source).toContain("disabled={pending || !confirmationMatches}")
    expect(source).toContain('<Spinner data-icon="inline-start" />')
    expect(source).toContain('variant={destructive ? "destructive" : "default"}')
  })
})
