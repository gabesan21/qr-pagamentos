import "server-only";

import {
  createHash,
  createHmac,
  hkdfSync,
  timingSafeEqual,
} from "node:crypto";

import { loadEncryptionKey } from "@/lib/nautt-crypto";

import type { DirectoryPageSize } from "./query-contract";

export const MAX_CURSOR_DECODED_BYTES = 512;
const CURSOR_VERSION = 1;
const CURSOR_TAG_BYTES = 32;
const CURSOR_DOMAIN = "qr-data-directory-cursor-v1";
const base64url = /^[A-Za-z0-9_-]+$/;

export type DirectoryScopePurpose = "MERCHANT_OWN" | "ADMIN_GLOBAL";
export type DirectoryCursorDirection = "forward" | "backward";
export type DirectoryCursorEnvelope = Readonly<{
  version: 1;
  directory: string;
  scopePurpose: DirectoryScopePurpose;
  direction: DirectoryCursorDirection;
  size: DirectoryPageSize;
  filterHash: string;
  orderId: string;
  tuple: readonly (string | number | boolean | null)[];
}>;

type CursorContext = Readonly<{
  directory: string;
  scopePurpose: DirectoryScopePurpose;
  principalId: string;
  size: DirectoryPageSize;
  canonicalFilterQuery: string;
  orderId: string;
}>;

export type DecodedCursor =
  | Readonly<{ status: "valid"; cursor: DirectoryCursorEnvelope }>
  | Readonly<{ status: "stale" }>
  | Readonly<{ status: "invalid" }>;

function canonicalEnvelope(envelope: DirectoryCursorEnvelope): string {
  return JSON.stringify({
    version: envelope.version,
    directory: envelope.directory,
    scopePurpose: envelope.scopePurpose,
    direction: envelope.direction,
    size: envelope.size,
    filterHash: envelope.filterHash,
    orderId: envelope.orderId,
    tuple: envelope.tuple,
  });
}

export function hashDirectoryFilters(canonicalFilterQuery: string): string {
  return createHash("sha256").update(canonicalFilterQuery, "utf8").digest("base64url");
}

function deriveKey(
  rootKey: Buffer,
  scopePurpose: DirectoryScopePurpose,
  principalId: string,
): Buffer {
  const scope = scopePurpose === "MERCHANT_OWN" ? principalId : "admin-global";
  const info = Buffer.from(`${CURSOR_DOMAIN}\0${scopePurpose}\0${scope}`, "utf8");
  return Buffer.from(hkdfSync("sha256", rootKey, Buffer.alloc(0), info, 32));
}

function canonicalSegment(segment: string): Buffer | null {
  if (!base64url.test(segment)) return null;
  const decoded = Buffer.from(segment, "base64url");
  return decoded.toString("base64url") === segment ? decoded : null;
}

function isExactEnvelope(value: unknown): value is DirectoryCursorEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const exactKeys = ["version", "directory", "scopePurpose", "direction", "size", "filterHash", "orderId", "tuple"];
  return (
    keys.length === exactKeys.length
    && exactKeys.every((key) => keys.includes(key))
    && record.version === CURSOR_VERSION
    && typeof record.directory === "string"
    && record.directory.length > 0
    && record.directory.length <= 64
    && (record.scopePurpose === "MERCHANT_OWN" || record.scopePurpose === "ADMIN_GLOBAL")
    && (record.direction === "forward" || record.direction === "backward")
    && (record.size === 25 || record.size === 50 || record.size === 100)
    && typeof record.filterHash === "string"
    && /^[A-Za-z0-9_-]{43}$/u.test(record.filterHash)
    && typeof record.orderId === "string"
    && record.orderId.length > 0
    && record.orderId.length <= 64
    && Array.isArray(record.tuple)
    && record.tuple.length > 0
    && record.tuple.length <= 8
    && record.tuple.every((part) => (
      part === null
      || typeof part === "boolean"
      || (typeof part === "number" && Number.isSafeInteger(part))
      || (typeof part === "string" && Array.from(part).length <= 128)
    ))
  );
}

export function createDirectoryCursorCodec(
  keyLoader: () => Buffer = loadEncryptionKey,
) {
  return {
    encode(
      context: CursorContext,
      direction: DirectoryCursorDirection,
      tuple: DirectoryCursorEnvelope["tuple"],
    ): string {
      const envelope: DirectoryCursorEnvelope = {
        version: CURSOR_VERSION,
        directory: context.directory,
        scopePurpose: context.scopePurpose,
        direction,
        size: context.size,
        filterHash: hashDirectoryFilters(context.canonicalFilterQuery),
        orderId: context.orderId,
        tuple,
      };
      if (!isExactEnvelope(envelope)) throw new Error("Invalid directory cursor data");
      const payload = Buffer.from(canonicalEnvelope(envelope), "utf8");
      if (payload.length + CURSOR_TAG_BYTES > MAX_CURSOR_DECODED_BYTES) {
        throw new Error("Directory cursor exceeds its decoded byte bound");
      }
      const key = deriveKey(keyLoader(), context.scopePurpose, context.principalId);
      const tag = createHmac("sha256", key).update(payload).digest();
      return `${payload.toString("base64url")}.${tag.toString("base64url")}`;
    },

    decode(
      token: string,
      context: CursorContext,
      validateTuple: (tuple: DirectoryCursorEnvelope["tuple"]) => boolean,
    ): DecodedCursor {
      const segments = token.split(".");
      if (segments.length !== 2) return { status: "invalid" };
      const payload = canonicalSegment(segments[0]);
      const tag = canonicalSegment(segments[1]);
      if (
        !payload
        || !tag
        || tag.length !== CURSOR_TAG_BYTES
        || payload.length + tag.length > MAX_CURSOR_DECODED_BYTES
      ) return { status: "invalid" };

      const key = deriveKey(keyLoader(), context.scopePurpose, context.principalId);
      const expectedTag = createHmac("sha256", key).update(payload).digest();
      if (!timingSafeEqual(tag, expectedTag)) return { status: "invalid" };

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload.toString("utf8"));
      } catch {
        return { status: "invalid" };
      }
      if (!isExactEnvelope(parsed) || canonicalEnvelope(parsed) !== payload.toString("utf8")) {
        return { status: "invalid" };
      }
      if (
        parsed.directory !== context.directory
        || parsed.scopePurpose !== context.scopePurpose
        || parsed.orderId !== context.orderId
      ) return { status: "invalid" };
      if (
        parsed.size !== context.size
        || parsed.filterHash !== hashDirectoryFilters(context.canonicalFilterQuery)
      ) return { status: "stale" };
      if (!validateTuple(parsed.tuple)) return { status: "invalid" };
      return { status: "valid", cursor: parsed };
    },
  };
}

export type DirectoryCursorCodec = ReturnType<typeof createDirectoryCursorCodec>;
