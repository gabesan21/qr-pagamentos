import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

import { canonicalizeMedia, MediaValidationError } from "./media-validation";
import { MAX_MEDIA_BYTES } from "./types";

async function fixture(format: "jpeg" | "png" | "webp", width = 2, height = 2) {
  return sharp({
    create: { width, height, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.5 } },
  })[format]().toBuffer();
}

describe("media validation", () => {
  it.each(["jpeg", "png", "webp"] as const)("canonicalizes one safe %s image to metadata-free WebP", async (format) => {
    const result = await canonicalizeMedia(await fixture(format));
    expect(result.mimeType).toBe("image/webp");
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.byteSize).toBe(result.bytes.length);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await sharp(result.bytes).metadata()).format).toBe("webp");
  });

  it.each([
    Buffer.from("<svg/>"),
    Buffer.from("GIF89a"),
    Buffer.from("....ftypavif"),
    Buffer.alloc(MAX_MEDIA_BYTES + 1),
  ])("rejects disallowed or oversized bytes before persistence", async (bytes) => {
    await expect(canonicalizeMedia(bytes)).rejects.toBeInstanceOf(MediaValidationError);
  });

  it("rejects header dimensions beyond the contract before transformation", async () => {
    await expect(canonicalizeMedia(await fixture("png", 4097, 1))).rejects.toBeInstanceOf(MediaValidationError);
  });

  it("rejects truncated allowlisted input", async () => {
    const bytes = await fixture("jpeg");
    await expect(canonicalizeMedia(bytes.subarray(0, 12))).rejects.toBeInstanceOf(MediaValidationError);
  });
});
