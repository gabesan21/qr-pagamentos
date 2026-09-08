"use client"

import * as React from "react"
import { AlertCircle, ArrowDownToLine, ImagePlus, ImageOff, LoaderCircleIcon } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** What a successful staging call resolves with: an opaque identifier the caller persists and a URL this component can render immediately. Never a route, internal identifier, revision, or storage key. */
export interface StagedImage {
  identifier: string
  previewUrl: string
}

/** Localized copy for every visible or announced state. No dictionary import: every string is the caller's. */
export interface ImageUploaderLabels {
  /** Accessible name of the native file input / drop target. */
  selectFile: string
  /** Short instruction inside the idle tile, e.g. "Drag and drop or click to upload". */
  hint: string
  replace: string
  remove: string
  retry: string
  /** Announced (polite) while a staging call is in flight. */
  staging: string
  /** Announced (polite) once staging resolves. */
  staged: string
  /** Announced (polite) once the image is removed. */
  removed: string
  /** Shown and announced (assertive) when the injected `stage` call itself rejects. */
  uploadFailed: string
  /** Shown when the picked file's type is outside `accept`. */
  invalidType: string
  /** Shown when the picked file exceeds `maxBytes`. */
  tooLarge: string
}

/**
 * Props for {@link ImageUploader}. The component owns tile geometry, drag
 * handling, client-side hinting, and the staged/failed/disabled state
 * machine; it never knows a route, internal identifier, revision, or storage
 * key — that boundary belongs to the caller's injected `stage` function (see
 * `pop/specs/media-storage.md`).
 */
export interface ImageUploaderProps {
  /** Localized copy for every state. */
  labels: ImageUploaderLabels
  /** MIME types hinted to the picker and enforced client-side; server validation remains authoritative. */
  accept: readonly string[]
  /** Client-side size ceiling in bytes; server validation remains authoritative. */
  maxBytes: number
  /** Preview URL for an already-staged or previously attached image. `null`/`undefined` renders the idle tile. */
  currentPreviewUrl?: string | null
  /** Called with the staged identifier, or `null` after a remove. */
  onChange: (identifier: string | null) => void
  /** Called after a successful remove, in addition to `onChange(null)`. */
  onRemove?: () => void
  /**
   * Stages the given file on whatever boundary the caller owns and resolves
   * with the opaque identifier plus a URL to render. Rejects (any reason) to
   * enter the failed state with a retry that resubmits the same file.
   */
  stage: (file: File) => Promise<StagedImage>
  disabled?: boolean
  className?: string
}

type Status = "idle" | "staging" | "staged" | "failed"

function clientError(
  file: File,
  accept: readonly string[],
  maxBytes: number,
  labels: ImageUploaderLabels,
): string | null {
  if (accept.length > 0 && !accept.includes(file.type)) return labels.invalidType
  if (file.size > maxBytes) return labels.tooLarge
  return null
}

const tile =
  "flex size-32 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-2 p-2 text-center text-text-3 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"

/**
 * Role-neutral drop-tile image uploader. Six visually distinguishable states
 * — idle, drag-over, staging, staged (preview + replace/remove), failed
 * (retry), and disabled — each combining icon and text so no state depends on
 * color alone. The open target is the native `<input type="file">` itself,
 * associated to its tile through a `<label>` (never nested inside a
 * `<button>`), so it is keyboard-operable and announced by assistive tech
 * without any simulated click.
 */
export function ImageUploader({
  labels,
  accept,
  maxBytes,
  currentPreviewUrl = null,
  onChange,
  onRemove,
  stage,
  disabled = false,
  className,
}: ImageUploaderProps) {
  const [status, setStatus] = React.useState<Status>(currentPreviewUrl ? "staged" : "idle")
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(currentPreviewUrl)
  const [dragOver, setDragOver] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [announcement, setAnnouncement] = React.useState<string | null>(null)
  const [retryFile, setRetryFile] = React.useState<File | null>(null)
  const inputId = React.useId()
  const busy = status === "staging"
  const interactive = !disabled && !busy

  const runStage = React.useCallback(
    async (file: File) => {
      const validationError = clientError(file, accept, maxBytes, labels)
      if (validationError) {
        setRetryFile(null)
        setErrorMessage(validationError)
        setStatus("failed")
        return
      }
      setErrorMessage(null)
      setAnnouncement(labels.staging)
      setStatus("staging")
      try {
        const staged = await stage(file)
        setPreviewUrl(staged.previewUrl)
        setRetryFile(null)
        setAnnouncement(labels.staged)
        setStatus("staged")
        onChange(staged.identifier)
      } catch {
        setRetryFile(file)
        setErrorMessage(labels.uploadFailed)
        setStatus("failed")
      }
    },
    [accept, maxBytes, labels, stage, onChange],
  )

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) void runStage(file)
  }

  function handleDragOver(event: React.DragEvent<HTMLLabelElement>) {
    if (!interactive) return
    event.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragOver(false)
    if (!interactive) return
    const file = event.dataTransfer.files?.[0]
    if (file) void runStage(file)
  }

  function handleRemove() {
    setPreviewUrl(null)
    setRetryFile(null)
    setErrorMessage(null)
    setAnnouncement(labels.removed)
    setStatus("idle")
    onChange(null)
    onRemove?.()
  }

  function handleRetry() {
    if (retryFile) void runStage(retryFile)
  }

  const picker = (
    <input
      accept={accept.join(",")}
      aria-label={labels.selectFile}
      className="sr-only"
      disabled={!interactive}
      id={inputId}
      onChange={handleInputChange}
      type="file"
    />
  )

  return (
    <div className={cn("space-y-2", className)}>
      {status === "staged" && previewUrl ? (
        <div className="flex items-start gap-3">
          <img
            alt=""
            className="size-32 rounded-card border border-border object-cover shadow-card"
            height={128}
            src={previewUrl}
            width={128}
          />
          <div className="flex flex-col items-start gap-2 pt-1">
            <label
              className={cn(
                buttonVariants({ variant: "outline" }),
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
                !interactive && "pointer-events-none opacity-50",
              )}
              htmlFor={inputId}
            >
              {labels.replace}
              {picker}
            </label>
            <Button disabled={!interactive} onClick={handleRemove} type="button" variant="ghost">
              {labels.remove}
            </Button>
          </div>
        </div>
      ) : (
        <label
          aria-disabled={!interactive || undefined}
          className={cn(
            tile,
            dragOver && interactive && "border-solid border-accent bg-accent-soft text-accent",
            status === "failed" && "border-danger text-danger",
            !interactive && "opacity-50",
          )}
          htmlFor={inputId}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {status === "staging" ? (
            <LoaderCircleIcon aria-hidden className="size-6 animate-spin" />
          ) : status === "failed" ? (
            <ImageOff aria-hidden className="size-6" />
          ) : dragOver && interactive ? (
            <ArrowDownToLine aria-hidden className="size-6" />
          ) : (
            <ImagePlus aria-hidden className="size-6" />
          )}
          <span className="px-1 text-xs">{status === "staging" ? labels.staging : labels.hint}</span>
          {picker}
        </label>
      )}
      {status === "failed" ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{errorMessage}</span>
            {retryFile ? (
              <Button onClick={handleRetry} type="button" variant="ghost">
                {labels.retry}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <span aria-live="polite" className="sr-only" role="status">
        {status === "failed" ? null : announcement}
      </span>
    </div>
  )
}
