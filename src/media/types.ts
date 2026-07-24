export const MEDIA_PURPOSES = ["STOREFRONT_LOGO", "PRODUCT_IMAGE"] as const;
export const MEDIA_STATES = ["WRITING", "STAGED", "ACTIVE", "ORPHANED", "DELETING"] as const;
export const MEDIA_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const MAX_MEDIA_DIMENSION = 4096;
export const MAX_MEDIA_PIXELS = 16_777_216;
export const MEDIA_GRACE_MS = 24 * 60 * 60 * 1000;

export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];
export type MediaState = (typeof MEDIA_STATES)[number];

export type MediaRecord = Readonly<{
  id: string;
  identifier: string;
  storageKey: string;
  ownerId: string;
  purpose: MediaPurpose;
  state: MediaState;
  lifecycleRevision: bigint;
  mimeType: "image/webp";
  byteSize: bigint;
  width: number;
  height: number;
  sha256: string;
  purgeAfter: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CanonicalMedia = Readonly<{
  bytes: Buffer;
  mimeType: "image/webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
}>;

export type MediaRead = Readonly<{
  bytes: Buffer;
  identifier: string;
  revision: bigint;
}>;
