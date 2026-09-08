"use client";

import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";

import { cn } from "@/lib/utils";

type QrDisplayProps = Readonly<{
  alternativeLabel?: string;
  alternativeValue?: string;
  caption?: string;
  className?: string;
  graphic?: ReactNode;
  graphicLabel: string;
  identity?: ReactNode;
  payload?: string;
  pending?: boolean;
}>;

/**
 * Frames a QR graphic on a forced-light frame that stays legible in all six
 * themes. A caller may still render its own `graphic` (every existing owner
 * keeps compiling unchanged); passing `payload` instead lets this owner
 * generate the SVG itself with the pinned `qrcode` package, the same
 * client-side pattern already used by src/app/profile/totp-qr-code.tsx.
 * `graphic` always wins when both are supplied. Error correction rises to
 * "H" whenever an `identity` centre-cut is present, because the covered
 * centre consumes redundancy the decoder needs back.
 */
export function QrDisplay({
  alternativeLabel,
  alternativeValue,
  caption,
  className,
  graphic,
  graphicLabel,
  identity,
  payload,
  pending = false,
}: QrDisplayProps) {
  const errorCorrectionLevel = identity ? "H" : "M";
  const [generated, setGenerated] = useState<{ svg: string; forPayload: string; forLevel: string } | null>(null);
  const generatedSvg =
    generated && generated.forPayload === payload && generated.forLevel === errorCorrectionLevel ? generated.svg : null;

  useEffect(() => {
    if (graphic || !payload) {
      return;
    }

    let cancelled = false;
    QRCode.toString(payload, {
      type: "svg",
      margin: 2,
      errorCorrectionLevel,
    })
      .then((svg) => {
        if (!cancelled) setGenerated({ svg, forPayload: payload, forLevel: errorCorrectionLevel });
      })
      .catch(() => {
        if (!cancelled) setGenerated(null);
      });

    return () => {
      cancelled = true;
    };
  }, [errorCorrectionLevel, graphic, payload]);

  const isGenerating = Boolean(payload) && !graphic && !generatedSvg;
  const isPending = pending || isGenerating;
  const resolvedGraphic =
    graphic ??
    (generatedSvg ? (
      <div className="size-full" dangerouslySetInnerHTML={{ __html: generatedSvg }} />
    ) : (
      <div aria-hidden="true" className="size-full" />
    ));

  return (
    <figure aria-busy={isPending || undefined} className={cn("flex flex-col items-center gap-3", className)}>
      <div
        aria-label={graphicLabel}
        className={cn(
          "relative grid aspect-square w-full max-w-66 place-items-center overflow-hidden rounded-lg bg-white p-4 ring-1 ring-border",
          isPending && "animate-pulse",
        )}
        data-pending={isPending || undefined}
        role="img"
      >
        {resolvedGraphic}
        {identity ? (
          <span className="absolute left-1/2 top-1/2 grid size-11 -translate-1/2 place-items-center rounded-full bg-white p-1">
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
