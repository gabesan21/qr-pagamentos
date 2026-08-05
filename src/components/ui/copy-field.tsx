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

type CopyFieldProps = {
  value: string
  labels: CopyFieldLabels
  truncate?: boolean
  className?: string
  onCopy?: (state: CopyState) => void
}

function CopyStateIcon({ state }: { state: CopyState }) {
  if (state === "pending") {
    return <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
  }

  if (state === "copied") {
    return <CheckIcon aria-hidden="true" />
  }

  if (state === "failed") {
    return <TriangleAlertIcon aria-hidden="true" />
  }

  return <CopyIcon aria-hidden="true" />
}

function CopyField({
  value,
  labels,
  truncate = true,
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
      <span
        id={statusId}
        role={state === "failed" ? "alert" : "status"}
        aria-live={state === "failed" ? "assertive" : "polite"}
        className="sr-only"
      >
        {statusLabel}
      </span>
    </span>
  )
}

export { CopyField }
export type { CopyFieldLabels, CopyFieldProps }
