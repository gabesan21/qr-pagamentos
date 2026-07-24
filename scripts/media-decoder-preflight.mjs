#!/usr/bin/env node

import assert from "node:assert/strict";

import sharp from "sharp";

const LIMIT_INPUT_PIXELS = 16_777_216;
const EXPECTED_SHARP_VERSION = "0.34.5";

assert.equal(sharp.versions.sharp, EXPECTED_SHARP_VERSION, "Sharp version differs from the reviewed decoder");
assert.match(sharp.versions.vips ?? "", /^\d+\.\d+\.\d+$/, "Bundled libvips is unavailable");

sharp.cache(false);
sharp.concurrency(1);

function decoder(bytes, animated = false) {
  return sharp(bytes, {
    animated,
    failOn: "error",
    limitInputPixels: LIMIT_INPUT_PIXELS,
    sequentialRead: true,
  }).timeout({ seconds: 5 });
}

function assertSafeMetadata(metadata) {
  const width = metadata.width ?? 0;
  const height = metadata.pageHeight ?? metadata.height ?? 0;
  assert(["jpeg", "png", "webp"].includes(metadata.format), "Decoder reported a disallowed format");
  assert.equal(metadata.pages ?? 1, 1, "Decoder reported multiple pages");
  assert(width > 0 && height > 0 && width <= 4096 && height <= 4096, "Decoder reported unsafe dimensions");
  assert(width * height <= LIMIT_INPUT_PIXELS, "Decoder reported an unsafe pixel count");
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

for (const format of ["jpeg", "png", "webp"]) {
  const fixture = await sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 1 },
    },
  })[format]().toBuffer();
  const metadata = await decoder(fixture).metadata();
  assert.equal(metadata.format, format);
  assertSafeMetadata(metadata);
}

const gifHeader = "47494638396101000100800000000000ffffff";
const gifFrame = "21f90401000000002c00000000010001000002014400";
const animatedGif = Buffer.from(`${gifHeader}${gifFrame}${gifFrame}3b`, "hex");
const pageMetadata = await decoder(animatedGif, true).metadata();
assert.equal(pageMetadata.pages, 2, "Decoder page reporting is unavailable");
assert.throws(() => assertSafeMetadata(pageMetadata), /multiple pages|disallowed format/);

const oversizedPng = await sharp({
  create: {
    width: 4097,
    height: 1,
    channels: 3,
    background: { r: 0, g: 0, b: 0 },
  },
}).png().toBuffer();
const oversizedMetadata = await decoder(oversizedPng).metadata();
assert.equal(oversizedMetadata.width, 4097, "Header-declared dimensions were not preserved");
assert.throws(() => assertSafeMetadata(oversizedMetadata), /unsafe dimensions/);

const bombHeader = Buffer.from(oversizedPng);
bombHeader.writeUInt32BE(4097, 16);
bombHeader.writeUInt32BE(4097, 20);
bombHeader.writeUInt32BE(crc32(bombHeader.subarray(12, 29)), 29);
await assert.rejects(decoder(bombHeader).metadata(), /pixel|limit/i);

console.log(`PASS media-decoder-preflight sharp=${sharp.versions.sharp} vips=${sharp.versions.vips}`);
