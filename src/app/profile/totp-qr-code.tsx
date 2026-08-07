"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { QrDisplay } from "@/components/ui/qr-display";

type TotpQrCodeProps = {
  provisioningUri: string;
  label: string;
  caption?: string;
};

export function TotpQrCode({ provisioningUri, label, caption }: TotpQrCodeProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(provisioningUri, { type: "svg", margin: 2, errorCorrectionLevel: "M" })
      .then((value) => {
        if (!cancelled) setSvg(value);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => { cancelled = true; };
  }, [provisioningUri]);

  return (
    <QrDisplay
      caption={caption}
      className="max-w-xs"
      graphic={svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div aria-busy="true" className="size-full" role="status" />}
      graphicLabel={label}
      pending={!svg}
    />
  );
}
