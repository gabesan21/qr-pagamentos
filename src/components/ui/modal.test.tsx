// @vitest-environment jsdom

import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Button } from "./button"
import { ConfirmDialog, Modal } from "./modal"

afterEach(cleanup)

function ModalHarness({ dismissible }: { dismissible: boolean }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Edit payment link"
        closeLabel="Close modal"
        dismissible={dismissible}
      >
        <Button>First action</Button>
        <Button>Second action</Button>
      </Modal>
    </>
  )
}

function ConfirmHarness({ onConfirm }: { onConfirm: () => void | Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open confirmation</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={onConfirm}
        title="Delete payment link"
        description="This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        pendingLabel="Deleting"
        failureMessage="Deletion failed. Try again."
      />
    </>
  )
}

describe("Modal", () => {
  it("traps focus while open and restores it after an allowed keyboard dismissal", async () => {
    const user = userEvent.setup()
    render(<ModalHarness dismissible />)

    const opener = screen.getByRole("button", { name: "Open modal" })
    await user.click(opener)
    const firstAction = screen.getByRole("button", { name: "First action" })
    expect(document.activeElement).toBe(firstAction)

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close modal" }))
    await user.keyboard("{Escape}")

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
    expect(document.activeElement).toBe(opener)
  })

  it("blocks keyboard dismissal when the modal is not dismissible", async () => {
    const user = userEvent.setup()
    render(<ModalHarness dismissible={false} />)

    await user.click(screen.getByRole("button", { name: "Open modal" }))
    await user.keyboard("{Escape}")

    expect(screen.getByRole("dialog")).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Close modal" })).toBeNull()
  })
})

describe("ConfirmDialog", () => {
  it("blocks duplicate pending confirmation, retains failure, and allows retry", async () => {
    const user = userEvent.setup()
    let rejectConfirmation: (reason?: unknown) => void = () => undefined
    const onConfirm = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () => new Promise<void>((_resolve, reject) => {
          rejectConfirmation = reject
        }),
      )
      .mockResolvedValueOnce(undefined)
    render(<ConfirmHarness onConfirm={onConfirm} />)

    await user.click(screen.getByRole("button", { name: "Open confirmation" }))
    const confirmButton = screen.getByRole("button", {
      name: "Delete",
    }) as HTMLButtonElement
    await user.click(confirmButton)

    expect(confirmButton.disabled).toBe(true)
    expect(
      (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await user.keyboard("{Escape}")
    expect(screen.getByRole("alertdialog")).not.toBeNull()
    await user.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledTimes(1)

    rejectConfirmation(new Error("network"))
    await screen.findByText("Deletion failed. Try again.")
    expect(screen.getByRole("alertdialog")).not.toBeNull()

    await user.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull()
    })
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })
})
