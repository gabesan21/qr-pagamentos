import { createHash, createHmac, randomBytes } from "node:crypto";

export class TotpValidationError extends Error {}
export class TotpConflictError extends Error {}
export class TotpUnavailableError extends Error {}

export type TotpCredential = Readonly<{
  userId: string;
  encryptedSecret: string;
  confirmedAt: Date | null;
  replayCounter: number;
  algorithm: string;
  digits: number;
  stepSeconds: number;
}>;

export type TotpRecoveryCode = Readonly<{
  id: string;
  credentialId: string;
  codeDigest: string;
  consumedAt: Date | null;
}>;

export type TotpEnrollment = Readonly<{
  secret: string;
  provisioningUri: string;
  recoveryCodes: string[];
}>;

export interface TotpCrypto {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export interface TotpStore {
  getCredential(userId: string): Promise<TotpCredential | null>;
  getRecoveryCodes(credentialId: string): Promise<TotpRecoveryCode[]>;
  beginEnrollment(
    userId: string,
    encryptedSecret: string,
    now: Date,
    recoveryCodes: Readonly<{ id: string; codeDigest: string; createdAt: Date }>[],
  ): Promise<void>;
  confirm(userId: string, confirmedAt: Date): Promise<boolean>;
  updateReplayCounter(userId: string, counter: number, now: Date): Promise<void>;
  consumeRecoveryCode(id: string, consumedAt: Date): Promise<void>;
  disable(userId: string): Promise<void>;
}

const DEFAULT_ALGORITHM = "SHA1";
const DEFAULT_DIGITS = 6;
const DEFAULT_STEP_SECONDS = 30;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 16;
const SECRET_BYTES = 20;
const WINDOW_STEPS = 1;

function encodeBase32(bytes: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let output = "";
  let bits = 0;
  let value = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    value = (value << 8) | bytes[index];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const map = new Map("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".split("").map((character, index) => [character, index]));
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of input.toUpperCase()) {
    const mapped = map.get(character);
    if (mapped === undefined) throw new TotpValidationError("Invalid base32 character");
    value = (value << 5) | mapped;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const buffer = Buffer.allocUnsafe(8);
  let remaining = counter;
  for (let index = 7; index >= 0; index -= 1) {
    buffer[index] = remaining & 0xff;
    remaining = remaining >>> 8;
  }
  const hmac = createHmac("sha1", secret).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  const value = binary % 10 ** digits;
  return String(value).padStart(digits, "0");
}

function provisioningUri(username: string, secret: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(username)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: DEFAULT_ALGORITHM,
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createTotpService(
  store: TotpStore,
  crypto: TotpCrypto,
  clock: () => Date = () => new Date(),
  issuer: string = "QR Pagamentos",
) {
  function generateSecret(): string {
    return encodeBase32(randomBytes(SECRET_BYTES));
  }

  function generateRecoveryCodes(): { plaintext: string; codeDigest: string; id: string; createdAt: Date }[] {
    const now = clock();
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const plaintext = randomBytes(RECOVERY_CODE_BYTES).toString("hex");
      return { plaintext, codeDigest: createHash("sha256").update(plaintext).digest("hex"), id: cryptoRandomUuid(), createdAt: now };
    });
  }

  function currentCounter(stepSeconds: number): number {
    return Math.floor(clock().getTime() / 1000 / stepSeconds);
  }

  function validateTotpCode(secret: string, code: string, stepSeconds: number, replayCounter: number): { accepted: boolean; counter: number } {
    if (!/^[0-9]{6}$/.test(code)) return { accepted: false, counter: -1 };
    const secretBytes = decodeBase32(secret);
    const center = currentCounter(stepSeconds);
    for (let offset = -WINDOW_STEPS; offset <= WINDOW_STEPS; offset += 1) {
      const counter = center + offset;
      if (counter <= replayCounter) continue;
      const expected = hotp(secretBytes, counter, DEFAULT_DIGITS);
      if (expected === code) return { accepted: true, counter };
    }
    return { accepted: false, counter: -1 };
  }

  async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const credential = await store.getCredential(userId);
    if (!credential) return false;
    const codes = await store.getRecoveryCodes(credential.userId);
    const codeDigest = digest(code);
    const match = codes.find((candidate) => candidate.consumedAt === null && candidate.codeDigest === codeDigest);
    if (!match) return false;
    await store.consumeRecoveryCode(match.id, clock());
    return true;
  }

  return {
    async isEnrolled(userId: string): Promise<boolean> {
      const credential = await store.getCredential(userId);
      return credential !== null && credential.confirmedAt !== null;
    },

    async hasPendingEnrollment(userId: string): Promise<boolean> {
      const credential = await store.getCredential(userId);
      return credential !== null && credential.confirmedAt === null;
    },

    async enroll(userId: string, username: string): Promise<TotpEnrollment> {
      const existing = await store.getCredential(userId);
      if (existing) throw new TotpConflictError("TOTP enrollment already exists");
      const secret = generateSecret();
      const encryptedSecret = crypto.encrypt(secret);
      const recovery = generateRecoveryCodes();
      await store.beginEnrollment(
        userId,
        encryptedSecret,
        clock(),
        recovery.map((item) => ({ id: item.id, codeDigest: item.codeDigest, createdAt: item.createdAt })),
      );
      return {
        secret,
        provisioningUri: provisioningUri(username, secret, issuer),
        recoveryCodes: recovery.map((item) => item.plaintext),
      };
    },

    async confirm(userId: string, code: string): Promise<void> {
      const credential = await store.getCredential(userId);
      if (!credential) throw new TotpUnavailableError("TOTP enrollment is unavailable");
      if (credential.confirmedAt !== null) throw new TotpConflictError("TOTP is already active");
      const secret = crypto.decrypt(credential.encryptedSecret);
      const result = validateTotpCode(secret, code, credential.stepSeconds, credential.replayCounter);
      if (!result.accepted) throw new TotpValidationError("TOTP code is invalid");
      const confirmed = await store.confirm(userId, clock());
      if (!confirmed) throw new TotpUnavailableError("TOTP enrollment is unavailable");
      await store.updateReplayCounter(userId, result.counter, clock());
    },

    async validate(userId: string, code: string): Promise<boolean> {
      const credential = await store.getCredential(userId);
      if (!credential || credential.confirmedAt === null) return false;
      const secret = crypto.decrypt(credential.encryptedSecret);
      const result = validateTotpCode(secret, code, credential.stepSeconds, credential.replayCounter);
      if (!result.accepted) return false;
      await store.updateReplayCounter(userId, result.counter, clock());
      return true;
    },

    async validateWithRecoveryCode(userId: string, code: string): Promise<boolean> {
      return consumeRecoveryCode(userId, code);
    },

    async disable(userId: string): Promise<void> {
      const credential = await store.getCredential(userId);
      if (!credential) throw new TotpUnavailableError("TOTP is unavailable");
      await store.disable(userId);
    },

    async regenerateRecoveryCodes(userId: string): Promise<string[]> {
      throw new TotpUnavailableError("Recovery-code regeneration is not implemented");
    },
  };
}

function cryptoRandomUuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type TotpService = ReturnType<typeof createTotpService>;
