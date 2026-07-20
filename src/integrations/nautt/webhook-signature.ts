import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookSecretCandidate = { readonly ownerId: string; readonly secret: Buffer };

export type SignatureVerificationDependencies = {
  readonly compare?: (actual: Buffer, expected: Buffer) => boolean;
};

const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/;

export function parseWebhookSignature(value: string | null): Buffer | null {
  if (value === null) return null;
  const match = SIGNATURE_PATTERN.exec(value);
  return match ? Buffer.from(match[1], "hex") : null;
}

export function verifyWebhookOwner(
  rawBody: Buffer,
  signatureValue: string | null,
  candidates: readonly WebhookSecretCandidate[],
  dependencies: SignatureVerificationDependencies = {},
): string | null {
  const expected = parseWebhookSignature(signatureValue);
  if (!expected || expected.length !== 32) {
    for (const candidate of candidates) candidate.secret.fill(0);
    return null;
  }
  const compare = dependencies.compare ?? timingSafeEqual;
  const matches: string[] = [];
  for (const candidate of candidates) {
    try {
      const actual = createHmac("sha256", candidate.secret).update(rawBody).digest();
      if (actual.length === expected.length && compare(actual, expected)) matches.push(candidate.ownerId);
    } finally {
      candidate.secret.fill(0);
    }
  }
  return matches.length === 1 ? matches[0] : null;
}
