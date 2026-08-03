// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CopyField } from "./copy-field"

const labels = {
  copy: "Copy PIX code",
  pending: "Copying PIX code",
  copied: "PIX code copied",
  failed: "Copy failed. Try again.",
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("CopyField", () => {
  it("announces pending and copied feedback while deduplicating an in-flight copy", async () => {
    const user = userEvent.setup()
    let resolveCopy: () => void = () => undefined
    const writeText = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveCopy = resolve
      }),
    )
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    render(<CopyField value="000201010212" labels={labels} />)

    const copyButton = screen.getByRole("button", {
      name: labels.copy,
    }) as HTMLButtonElement
    await user.click(copyButton)

    expect(copyButton.disabled).toBe(true)
    expect(screen.getByRole("status").textContent).toContain(labels.pending)

    await user.click(copyButton)
    expect(writeText).toHaveBeenCalledTimes(1)

    resolveCopy()
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(labels.copied)
    })
  })

  it("retains clipboard failure as assertive feedback and permits retry", async () => {
    const user = userEvent.setup()
    const writeText = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("denied"))
      .mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    render(<CopyField value="000201010212" labels={labels} />)

    await user.click(screen.getByRole("button", { name: labels.copy }))
    const failure = await screen.findByRole("alert")
    expect(failure.textContent).toContain(labels.failed)

    await user.click(screen.getByRole("button", { name: labels.failed }))
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(labels.copied)
    })
    expect(writeText).toHaveBeenCalledTimes(2)
  })
})
