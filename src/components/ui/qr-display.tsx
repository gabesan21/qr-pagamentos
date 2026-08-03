import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type QrDisplayProps = Readonly<{
  alternativeLabel?: string;
  alternativeValue?: string;
  caption?: string;
  className?: string;
  graphic: ReactNode;
  graphicLabel: string;
  identity?: ReactNode;
  pending?: boolean;
}>;

/** Frames caller-rendered QR graphics; payload generation remains with a domain owner. */
export function QrDisplay({
  alternativeLabel,
  alternativeValue,
  caption,
  className,
  graphic,
  graphicLabel,
  identity,
  pending = false,
}: QrDisplayProps) {
  return (
    <figure aria-busy={pending || undefined} className={cn("flex flex-col items-center gap-3", className)}>
      <div
        aria-label={graphicLabel}
        className={cn(
          "relative grid aspect-square w-full max-w-66 place-items-center overflow-hidden rounded-lg bg-card p-4 ring-1 ring-border",
          pending && "animate-pulse",
        )}
        data-pending={pending || undefined}
        role="img"
      >
        {graphic}
        {identity ? (
          <span className="absolute left-1/2 top-1/2 grid size-11 -translate-1/2 place-items-center rounded-full bg-card p-1">
            {identity}
          </span>
        ) : null}
      </div>
      {caption ? <figcaption className="max-w-sm text-center text-sm text-muted-foreground">{caption}</figcaption> : null}
      {alternativeValue ? (
        <div className="flex w-full max-w-sm flex-col gap-1">
          {alternativeLabel ? <span className="text-sm font-medium">{alternativeLabel}</span> : null}
          <code className="break-all rounded-md bg-muted p-3 font-mono text-sm tabular-nums">{alternativeValue}</code>
        </div>
      ) : null}
    </figure>
  );
}
