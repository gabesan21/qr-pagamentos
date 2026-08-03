// @vitest-environment jsdom

import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { compile } from "tailwindcss"
import { describe, expect, it } from "vitest"

import { InputOTP, InputOTPGroup, InputOTPSlot } from "./input-otp"

const focusClasses = ["focus-visible:ring-3", "focus-visible:ring-ring"]

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
  it("keeps OTP keyboard entry and emits a semantic three-pixel focus ring", async () => {
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
    expect(input?.className).toContain(focusClasses[0])
    expect(input?.className).toContain(focusClasses[1])

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
    document.body.append(focusProbe)
    focusProbe.focus()
    const computed = getComputedStyle(focusProbe)

    expect(focusProbe.matches(":focus-visible")).toBe(true)
    expect(computed.boxShadow).toContain("--tw-ring-shadow")
    expect(computed.getPropertyValue("--tw-ring-shadow")).toContain(
      "calc(3px + var(--tw-ring-offset-width))",
    )
    expect(css).toContain(":focus-visible")
    expect(css).toContain("--tw-ring-color: var(--color-ring);")
    expect(css).toContain("0 0 #0000")
    expect(css).toContain("calc(3px + var(--tw-ring-offset-width))")
    expect(css).toContain("width: calc(var(--spacing) * 11);")
    expect(css).toContain("height: calc(var(--spacing) * 11);")
    expect(0.25 * 16 * 11).toBe(44)
  })
})
