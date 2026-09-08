// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ImageUploader, type ImageUploaderLabels } from "./image-uploader"

afterEach(cleanup)

const labels: ImageUploaderLabels = {
  selectFile: "Choose an image",
  hint: "Drag and drop or click to upload",
  replace: "Replace",
  remove: "Remove",
  retry: "Retry",
  staging: "Uploading…",
  staged: "Image uploaded",
  removed: "Image removed",
  uploadFailed: "Upload failed. Try again.",
  invalidType: "That file type is not supported.",
  tooLarge: "That file is too large.",
}

function file(name = "logo.png", type = "image/png") {
  return new File(["fixture"], name, { type })
}

describe("ImageUploader", () => {
  it("renders the idle tile with the picker as the native input inside its label", () => {
    const onChange = vi.fn()
    render(<ImageUploader accept={["image/png"]} labels={labels} maxBytes={1_000_000} onChange={onChange} stage={vi.fn()} />)

    expect(screen.getByText(labels.hint)).not.toBeNull()
    const input = screen.getByLabelText(labels.selectFile) as HTMLInputElement
    expect(input.type).toBe("file")
    expect(input.closest("label")).not.toBeNull()
    expect(input.closest("button")).toBeNull()
    expect(document.querySelector(".lucide-image-plus")).not.toBeNull()
  })

  it("shows a drag-over affordance distinguishable by icon and border, not color alone", () => {
    const onChange = vi.fn()
    const { container } = render(<ImageUploader accept={["image/png"]} labels={labels} maxBytes={1_000_000} onChange={onChange} stage={vi.fn()} />)
    const label = container.querySelector("label")!

    fireEvent.dragOver(label)
    expect(document.querySelector(".lucide-arrow-down-to-line")).not.toBeNull()
    expect(label.className).toContain("border-solid")

    fireEvent.dragLeave(label)
    expect(document.querySelector(".lucide-arrow-down-to-line")).toBeNull()
  })

  it("announces staging then shows the staged preview with replace/remove", async () => {
    let resolveStage: (value: { identifier: string; previewUrl: string }) => void = () => undefined
    const stage = vi.fn(() => new Promise<{ identifier: string; previewUrl: string }>((resolve) => { resolveStage = resolve }))
    const onChange = vi.fn()
    render(<ImageUploader accept={["image/png"]} labels={labels} maxBytes={1_000_000} onChange={onChange} stage={stage} />)

    const input = screen.getByLabelText(labels.selectFile) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file()] } })

    expect(document.querySelector(".lucide-loader-circle")).not.toBeNull()
    expect((await screen.findByRole("status")).textContent).toBe(labels.staging)

    resolveStage({ identifier: "media-1", previewUrl: "/media/media-1" })
    await waitFor(() => expect(screen.getByText(labels.replace)).not.toBeNull())
    expect(screen.getByText(labels.replace).closest("label")).not.toBeNull()
    expect(screen.getByRole("button", { name: labels.remove })).not.toBeNull()
    expect(document.querySelector("img")?.getAttribute("src")).toBe("/media/media-1")
    expect(onChange).toHaveBeenCalledWith("media-1")
  })

  it("enters the failed state with a retry that resubmits the same file", async () => {
    const stage = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ identifier: "media-2", previewUrl: "/media/media-2" })
    const onChange = vi.fn()
    render(<ImageUploader accept={["image/png"]} labels={labels} maxBytes={1_000_000} onChange={onChange} stage={stage} />)

    const input = screen.getByLabelText(labels.selectFile) as HTMLInputElement
    const picked = file()
    fireEvent.change(input, { target: { files: [picked] } })

    const alert = await screen.findByText(labels.uploadFailed)
    expect(alert.closest('[role="alert"]')).not.toBeNull()
    expect(document.querySelector(".lucide-image-off")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: labels.retry }))
    await waitFor(() => expect(stage).toHaveBeenCalledTimes(2))
    expect(stage.mock.calls[1][0]).toBe(picked)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("media-2"))
  })

  it("rejects an unsupported type or oversized file client-side without calling stage", async () => {
    const stage = vi.fn()
    render(<ImageUploader accept={["image/png"]} labels={labels} maxBytes={10} onChange={vi.fn()} stage={stage} />)

    const input = screen.getByLabelText(labels.selectFile) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file("logo.gif", "image/gif")] } })
    expect(await screen.findByText(labels.invalidType)).not.toBeNull()
    expect(stage).not.toHaveBeenCalled()
  })

  it("disables the input and the remove/replace affordances without relying on color alone", () => {
    render(<ImageUploader accept={["image/png"]} currentPreviewUrl="/media/existing" disabled labels={labels} maxBytes={1_000_000} onChange={vi.fn()} stage={vi.fn()} />)

    expect((screen.getByLabelText(labels.selectFile) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: labels.remove }) as HTMLButtonElement).disabled).toBe(true)
  })
})
