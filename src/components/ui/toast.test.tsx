import { beforeEach, describe, expect, it, vi } from "vitest"

const toastMocks = vi.hoisted(() => ({
  info: vi.fn(() => "info-id"),
  success: vi.fn(() => "success-id"),
  warning: vi.fn(() => "warning-id"),
  error: vi.fn(() => "error-id"),
}))

vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: toastMocks,
}))

import { showToast } from "./toast"

describe("showToast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("auto-dismisses only safe informational feedback", () => {
    showToast({ kind: "success", message: "Saved" })

    expect(toastMocks.success).toHaveBeenCalledWith(
      "Saved",
      expect.objectContaining({ duration: 5_000, important: false }),
    )
  })

  it("keeps urgent errors assertive, sticky, dismissible, and retryable", () => {
    const retry = vi.fn()
    showToast({
      kind: "error",
      message: "Could not save",
      action: { label: "Retry", onClick: retry },
      dismissLabel: "Dismiss",
    })

    expect(toastMocks.error).toHaveBeenCalledWith(
      "Could not save",
      expect.objectContaining({
        action: { label: "Retry", onClick: retry },
        duration: Infinity,
        important: true,
      }),
    )
  })
})
