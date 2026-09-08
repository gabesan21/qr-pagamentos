// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { toString } = vi.hoisted(() => ({ toString: vi.fn() }));
vi.mock("qrcode", () => ({ default: { toString } }));

import { QrDisplay } from "./qr-display";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

  it("generates an SVG at error correction level M for a plain payload", async () => {
    toString.mockResolvedValueOnce("<svg data-fixture=\"m-level\"></svg>");
    const { container } = render(<QrDisplay graphicLabel="QR code" payload="pix-payload" />);

    await waitFor(() => expect(container.querySelector('[data-fixture="m-level"]')).not.toBeNull());
    expect(toString).toHaveBeenCalledWith("pix-payload", expect.objectContaining({ errorCorrectionLevel: "M" }));
  });

  it("raises to error correction level H when an identity centre-cut is present", async () => {
    toString.mockResolvedValueOnce("<svg data-fixture=\"h-level\"></svg>");
    const { container } = render(<QrDisplay graphicLabel="QR code" identity={<span>QP</span>} payload="pix-payload" />);

    await waitFor(() => expect(container.querySelector('[data-fixture="h-level"]')).not.toBeNull());
    expect(toString).toHaveBeenCalledWith("pix-payload", expect.objectContaining({ errorCorrectionLevel: "H" }));
  });

  it("never generates when a caller-supplied graphic is present, even with a payload", () => {
    render(<QrDisplay graphic={<svg data-fixture="caller-graphic" />} graphicLabel="QR code" payload="pix-payload" />);
    expect(toString).not.toHaveBeenCalled();
  });

  it("clears aria-busy instead of pulsing forever when generation rejects", async () => {
    toString.mockRejectedValueOnce(new Error("encoding failed"));
    const { container } = render(<QrDisplay graphicLabel="QR code" payload="pix-payload" />);

    const figure = () => container.querySelector("figure")!;
    expect(figure().getAttribute("aria-busy")).toBe("true");
    await waitFor(() => expect(figure().getAttribute("aria-busy")).toBeNull());
    expect(container.querySelector('[data-pending="true"]')).toBeNull();
  });
});
