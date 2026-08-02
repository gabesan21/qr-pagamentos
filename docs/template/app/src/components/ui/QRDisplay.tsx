import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { CopyField } from "./CopyField";
import { Monogram } from "./Monogram";

/**
 * 264×264 QR on a white padded frame regardless of theme, with merchant monogram center-cut,
 * optional pending pulse ring, and PIX copy-and-paste payload (design.md §7).
 */
export function QRDisplay({
  payload,
  merchantName,
  caption,
  pending = false,
  size = 264,
  showPayload = true,
  className,
}: {
  payload: string;
  merchantName: string;
  caption?: string;
  pending?: boolean;
  size?: number;
  showPayload?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className={cn("rounded-card bg-white p-4", pending && "qr-pending-pulse")}>
        <div className="relative" style={{ width: size - 32, height: size - 32 }}>
          <QRCodeSVG value={payload} size={size - 32} level="M" includeMargin={false} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-1">
            <Monogram name={merchantName} size={40} />
          </div>
        </div>
      </div>
      {caption && <p className="text-sm text-text-2">{caption}</p>}
      {showPayload && <CopyField value={payload} className="w-full max-w-sm" />}
    </div>
  );
}
