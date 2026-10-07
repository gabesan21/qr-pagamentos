import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureVerificationDependencies = {
  readonly compare?: (actual: Buffer, expected: Buffer) => boolean;
};

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/;

export function parseWebhookSignature(value: string | null): Buffer | null {
  if (value === null) return null;
  const match = SIGNATURE_PATTERN.exec(value);
  return match ? Buffer.from(match[1], "hex") : null;
}

export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureValue: string | null,
  secret: Buffer,
  dependencies: SignatureVerificationDependencies = {},
): boolean {
  try {
    const expected = parseWebhookSignature(signatureValue);
    if (!expected || expected.length !== 32) return false;
    const actual = createHmac("sha256", secret).update(rawBody).digest();
    return (dependencies.compare ?? timingSafeEqual)(actual, expected);
  } finally {
    secret.fill(0);
  }
}
