"use client"

import * as React from "react"
import {
  CheckIcon,
  CopyIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CopyState = "ready" | "pending" | "copied" | "failed"

type CopyFieldLabels = {
  copy: string
  pending: string
  copied: string
  failed: string
}

type CopyFieldVariant = "button" | "compact"

type CopyFieldProps = {
  value: string
  labels: CopyFieldLabels
  truncate?: boolean
  variant?: CopyFieldVariant
  className?: string
  onCopy?: (state: CopyState) => void
}

function CopyStateIcon({ state, className }: { state: CopyState; className?: string }) {
  if (state === "pending") {
    return <LoaderCircleIcon aria-hidden="true" className={cn(className, "animate-spin")} />
  }

  if (state === "copied") {
    return <CheckIcon aria-hidden="true" className={className} />
  }

  if (state === "failed") {
    return <TriangleAlertIcon aria-hidden="true" className={className} />
  }

  return <CopyIcon aria-hidden="true" className={className} />
}

function CopyField({
  value,
  labels,
  truncate = true,
  variant = "button",
  className,
  onCopy,
}: CopyFieldProps) {
  const [state, setState] = React.useState<CopyState>("ready")
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusId = React.useId()

  React.useEffect(
    () => () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current)
      }
    },
    [],
  )

  const statusLabel = state === "ready" ? labels.copy : labels[state]

  async function handleCopy() {
    if (state === "pending") {
      return
    }

    setState("pending")
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable")
      }

      await navigator.clipboard.writeText(value)
      setState("copied")
      onCopy?.("copied")
      if (resetTimer.current) {
        clearTimeout(resetTimer.current)
      }
      resetTimer.current = setTimeout(() => setState("ready"), 2_000)
    } catch {
      setState("failed")
      onCopy?.("failed")
    }
  }

  const statusAnnouncement = (
    <span
      id={statusId}
      role={state === "failed" ? "alert" : "status"}
      aria-live={state === "failed" ? "assertive" : "polite"}
      className="sr-only"
    >
      {statusLabel}
    </span>
  )

  if (variant === "compact") {
    return (
      <span className={cn("inline-flex max-w-full flex-col items-start gap-1", className)}>
        <button
          type="button"
          disabled={state === "pending"}
          aria-describedby={statusId}
          aria-label={statusLabel}
          onClick={() => void handleCopy()}
          className="group inline-flex min-h-11 max-w-full items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-left transition-colors hover:border-accent focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <span className={cn("min-w-0 font-money text-xs text-text-2", truncate && "truncate")}>
            {value}
          </span>
          <CopyStateIcon
            state={state}
            className={cn(
              "size-3.5 shrink-0",
              state === "failed" ? "text-destructive" : "text-text-3 group-hover:text-accent",
            )}
          />
        </button>
        {statusAnnouncement}
      </span>
    )
  }

  return (
    <span className={cn("inline-flex max-w-full flex-col items-start gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        disabled={state === "pending"}
        aria-describedby={statusId}
        aria-label={statusLabel}
        onClick={() => void handleCopy()}
        className="max-w-full justify-start"
      >
        <span className={cn("min-w-0 font-mono text-xs", truncate && "truncate")}>
          {value}
        </span>
        <CopyStateIcon state={state} />
      </Button>
      {statusAnnouncement}
    </span>
  )
}

export { CopyField }
export type { CopyFieldLabels, CopyFieldProps, CopyFieldVariant }
