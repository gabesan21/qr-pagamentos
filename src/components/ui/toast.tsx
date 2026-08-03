"use client"

import { toast } from "sonner"

import { Toaster } from "@/components/ui/sonner"

type ToastKind = "info" | "success" | "warning" | "error"

type ToastAction = {
  label: string
  onClick: () => void
}

type ToastMessage = {
  kind: ToastKind
  message: string
  description?: string
  action?: ToastAction
  dismissLabel?: string
}

const SAFE_TOAST_DURATION = 5_000

function showToast({
  kind,
  message,
  description,
  action,
  dismissLabel,
}: ToastMessage) {
  const options = {
    description,
    action,
    cancel: dismissLabel ? { label: dismissLabel, onClick: () => undefined } : undefined,
    duration: kind === "error" || kind === "warning" ? Infinity : SAFE_TOAST_DURATION,
    important: kind === "error",
  }

  return toast[kind](message, options)
}

function ToastViewport({ label }: { label: string }) {
  return <Toaster aria-label={label} closeButton />
}

export { showToast, ToastViewport }
export type { ToastAction, ToastKind, ToastMessage }
