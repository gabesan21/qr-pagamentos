import "server-only";

import { createHash } from "node:crypto";

import sharp from "sharp";

import {
  MAX_MEDIA_BYTES,
  MAX_MEDIA_DIMENSION,
  MAX_MEDIA_PIXELS,
  type CanonicalMedia,
} from "./types";

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const SHARP_TIMEOUT_SECONDS = 5;
const EXPECTED_SHARP_VERSION = "0.34.5";

export class MediaValidationError extends Error {}

if (sharp.versions.sharp !== EXPECTED_SHARP_VERSION || !sharp.versions.vips) {
  throw new Error("The reviewed Sharp/libvips media decoder is unavailable");
}
sharp.cache(false);
sharp.concurrency(1);

function sniffFormat(bytes: Buffer): "jpeg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function reject(message: string): never {
  throw new MediaValidationError(message);
}

export async function canonicalizeMedia(input: Uint8Array): Promise<CanonicalMedia> {
  const bytes = Buffer.from(input);
  if (bytes.length === 0 || bytes.length > MAX_MEDIA_BYTES) reject("Media bytes exceed the accepted boundary");
  const signatureFormat = sniffFormat(bytes);
  if (!signatureFormat) reject("Media signature is not accepted");

  try {
    const decoder = sharp(bytes, {
      animated: true,
      failOn: "error",
      limitInputPixels: MAX_MEDIA_PIXELS,
      sequentialRead: true,
    }).timeout({ seconds: SHARP_TIMEOUT_SECONDS });
    const metadata = await decoder.metadata();
    const pages = metadata.pages ?? 1;
    const width = metadata.width ?? 0;
    const height = metadata.pageHeight ?? metadata.height ?? 0;
    if (!metadata.format || metadata.format !== signatureFormat || !ACCEPTED_FORMATS.has(metadata.format)) {
      reject("Media format does not match its signature");
    }
    if (pages !== 1) reject("Animated or multi-page media is not accepted");
    if (
      width < 1
      || height < 1
      || width > MAX_MEDIA_DIMENSION
      || height > MAX_MEDIA_DIMENSION
      || width * height > MAX_MEDIA_PIXELS
    ) {
      reject("Decoded media dimensions exceed the accepted boundary");
    }

    const encoded = await decoder
      .rotate()
      .webp({ effort: 4, lossless: false, quality: 85 })
      .toBuffer({ resolveWithObject: true });
    if (encoded.data.length === 0 || encoded.data.length > MAX_MEDIA_BYTES) {
      reject("Canonical media exceeds the accepted boundary");
    }
    return {
      bytes: encoded.data,
      mimeType: "image/webp",
      byteSize: encoded.data.length,
      width: encoded.info.width,
      height: encoded.info.height,
      sha256: createHash("sha256").update(encoded.data).digest("hex"),
    };
  } catch (error) {
    if (error instanceof MediaValidationError) throw error;
    throw new MediaValidationError("Media decoding failed");
  }
}
