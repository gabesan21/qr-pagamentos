"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type TotpQrCodeProps = {
  provisioningUri: string;
  label: string;
};

export function TotpQrCode({ provisioningUri, label }: Readonly<TotpQrCodeProps>) {
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

  if (!svg) return <div aria-busy="true" className="totp-qr-placeholder" role="status" />;

  return (
    <div
      aria-label={label}
      className="totp-qr-code"
      dangerouslySetInnerHTML={{ __html: svg }}
      role="img"
    />
  );
}
