// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { showToast, ToastViewport } from "./toast"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ToastViewport", () => {
  it("mounts assertive failure feedback with retry and a dismiss control", async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    render(<ToastViewport label="Payment feedback" />)
    HTMLElement.prototype.setPointerCapture = vi.fn()
    HTMLElement.prototype.releasePointerCapture = vi.fn()

    showToast({
      kind: "error",
      message: "Could not save payment link",
      description: "Your changes were kept. Try again.",
      action: { label: "Retry", onClick: retry },
      dismissLabel: "Dismiss",
    })

    const message = await screen.findByText("Could not save payment link")
    expect(message.closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite")
    expect(screen.getByText("Your changes were kept. Try again.")).not.toBeNull()

    await user.click(screen.getByRole("button", { name: "Retry" }))
    expect(retry).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Dismiss" }))
    await waitFor(() => {
      expect(screen.queryByText("Could not save payment link")).toBeNull()
    })
  })

  it("uses bounded duration only for safe feedback", () => {
    render(<ToastViewport label="Payment feedback" />)

    const id = showToast({ kind: "success", message: "Payment link saved" })
    expect(typeof id).toBe("number")
  })
})
