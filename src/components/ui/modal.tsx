"use client"

import * as React from "react"
import { TriangleAlertIcon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

type ModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  closeLabel: string
  dismissible?: boolean
  size?: "sm" | "md" | "lg"
}

const modalWidths = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
} as const

function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel,
  dismissible = true,
  size = "md",
}: ModalProps) {
  const restoreFocusRef = React.useRef<HTMLElement | null>(null)
  const wasOpenRef = React.useRef(open)

  React.useLayoutEffect(() => {
    if (open && !wasOpenRef.current && typeof document !== "undefined") {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    }
    wasOpenRef.current = open
  }, [open])

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && typeof document !== "undefined") {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    }

    if (!nextOpen && !dismissible) {
      return
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={dismissible}
        closeLabel={closeLabel}
        className={modalWidths[size]}
        onEscapeKeyDown={(event) => {
          if (!dismissible) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (!dismissible) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          if (restoreFocusRef.current) {
            event.preventDefault()
            restoreFocusRef.current.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

type ConfirmationRequirement = {
  expectedValue: string
  label: string
  description?: string
}

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  pendingLabel: string
  failureMessage: string
  destructive?: boolean
  confirmation?: ConfirmationRequirement
}

function ConfirmDialog({
  open,
  onOpenChange,
  ...contentProps
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false)

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && pending) {
      return
    }
    onOpenChange(nextOpen)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {open ? (
        <ConfirmDialogContentBody
          onOpenChange={handleOpenChange}
          pending={pending}
          setPending={setPending}
          {...contentProps}
        />
      ) : null}
    </AlertDialog>
  )
}

function ConfirmDialogContentBody({
  onOpenChange,
  pending,
  setPending,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  failureMessage,
  destructive = true,
  confirmation,
}: Omit<ConfirmDialogProps, "open"> & {
  pending: boolean
  setPending: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const [failure, setFailure] = React.useState(false)
  const [typedValue, setTypedValue] = React.useState("")
  const confirmationId = React.useId()

  const confirmationMatches = confirmation
    ? typedValue === confirmation.expectedValue
    : true

  async function handleConfirm() {
    if (pending || !confirmationMatches) {
      return
    }

    setPending(true)
    setFailure(false)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      setFailure(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        {destructive ? (
          <AlertDialogMedia>
            <TriangleAlertIcon aria-hidden="true" />
          </AlertDialogMedia>
        ) : null}
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      {confirmation ? (
        <Field data-invalid={false} data-disabled={pending}>
          <FieldLabel htmlFor={confirmationId}>{confirmation.label}</FieldLabel>
          <Input
            id={confirmationId}
            value={typedValue}
            disabled={pending}
            autoComplete="off"
            onChange={(event) => setTypedValue(event.currentTarget.value)}
          />
          {confirmation.description ? (
            <FieldDescription>{confirmation.description}</FieldDescription>
          ) : null}
        </Field>
      ) : null}
      {failure ? <FieldError>{failureMessage}</FieldError> : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
        <Button
          type="button"
          data-slot="alert-dialog-action"
          variant={destructive ? "destructive" : "default"}
          disabled={pending || !confirmationMatches}
          onClick={() => void handleConfirm()}
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

export { ConfirmDialog, Modal }
export type {
  ConfirmationRequirement,
  ConfirmDialogProps,
  ModalProps,
}
