import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QrDisplay } from "./qr-display";

describe("QrDisplay", () => {
  it("frames a caller-rendered graphic and exposes exact alternative text", () => {
    const payload = "00020126580014br.gov.bcb.pix";
    const markup = renderToStaticMarkup(
      <QrDisplay
        alternativeLabel="PIX copy and paste"
        alternativeValue={payload}
        caption="Scan with your bank"
        graphic={<svg aria-hidden viewBox="0 0 10 10" />}
        graphicLabel="PIX QR code"
        identity={<span aria-hidden>QP</span>}
        pending
      />,
    );

    expect(markup).toContain('aria-label="PIX QR code"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain(payload);
    expect(markup).toContain("Scan with your bank");
  });
});
