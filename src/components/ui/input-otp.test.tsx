// @vitest-environment jsdom

import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { compile } from "tailwindcss"
import { describe, expect, it } from "vitest"

import { InputOTP, InputOTPGroup, InputOTPSlot } from "./input-otp"

const focusClasses = [
  "focus-visible:!outline-3",
  "focus-visible:!outline-ring",
  "focus-visible:!outline-offset-2",
]

class InputOtpResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

globalThis.ResizeObserver = InputOtpResizeObserver
Object.defineProperty(document, "elementFromPoint", {
  configurable: true,
  value: () => null,
})

describe("InputOTP focus", () => {
  it("keeps OTP keyboard entry and overrides the library reset with a semantic three-pixel outline", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <InputOTP id="otp" maxLength={4}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>,
    )

    const input = container.querySelector("input")
    expect(input).not.toBeNull()
    expect(input?.id).toBe("otp")
    for (const focusClass of focusClasses) {
      expect(input?.className).toContain(focusClass)
    }

    await user.click(input!)
    await user.keyboard("12")
    expect(document.activeElement).toBe(input)
    expect(container.querySelectorAll('[data-slot="input-otp-slot"][data-active="true"]')).toHaveLength(1)
    expect(container.textContent).toContain("1")
    expect(container.textContent).toContain("2")

    const compiler = await compile(
      "@theme { --spacing: 0.25rem; --color-ring: var(--color-focus-ring); } @tailwind utilities;",
    )
    const css = compiler.build([...focusClasses, "size-11"])
    const stylesheet = document.createElement("style")
    stylesheet.textContent = css
    document.head.append(stylesheet)

    const focusProbe = document.createElement("input")
    focusProbe.className = focusClasses.join(" ")
    focusProbe.style.outline = "0 solid transparent"
    focusProbe.style.boxShadow = "none"
    document.body.append(focusProbe)
    focusProbe.focus()
    const computed = getComputedStyle(focusProbe)

    expect(focusProbe.matches(":focus-visible")).toBe(true)
    expect(computed.outlineWidth).toBe("3px")
    expect(computed.outlineColor).toBe("var(--color-ring)")
    expect(computed.outlineOffset).toBe("2px")
    expect(css).toContain(":focus-visible")
    expect(css).toContain("outline-width: 3px !important;")
    expect(css).toContain("outline-color: var(--color-ring) !important;")
    expect(css).toContain("outline-offset: 2px !important;")
    expect(css).toContain("width: calc(var(--spacing) * 11);")
    expect(css).toContain("height: calc(var(--spacing) * 11);")
    expect(0.25 * 16 * 11).toBe(44)
  })
})
