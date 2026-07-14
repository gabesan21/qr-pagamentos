import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import { validatePassword } from "./identity.ts";

const parameters = { N: 131072, r: 8, p: 1, maxmem: 268435456 } as const;
const recordPattern = /^scrypt\$v=1\$N=131072,r=8,p=1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, parameters, (error, key) => error ? reject(error) : resolve(key));
  });
}

function decodeCanonical(value: string, bytes: number): Buffer | undefined {
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === bytes && decoded.toString("base64url") === value ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function parseRecord(record: string): { salt: Buffer; key: Buffer } | undefined {
  if (Buffer.byteLength(record, "utf8") > 128 || /[^\x00-\x7f]/.test(record)) return undefined;
  const match = record.match(recordPattern);
  if (!match) return undefined;
  const salt = decodeCanonical(match[1], 16);
  const key = decodeCanonical(match[2], 32);
  return salt && key ? { salt, key } : undefined;
}

export async function hashPassword(plaintext: string): Promise<string> {
  const password = validatePassword(plaintext);
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$v=1$N=131072,r=8,p=1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(
  plaintext: string,
  record: string,
  onBeforeScrypt: () => void = () => undefined,
): Promise<boolean> {
  const parsed = parseRecord(record);
  if (!parsed) return false;
  try {
    const password = validatePassword(plaintext);
    onBeforeScrypt();
    const candidate = await deriveKey(password, parsed.salt);
    return timingSafeEqual(candidate, parsed.key);
  } catch {
    return false;
  }
}
