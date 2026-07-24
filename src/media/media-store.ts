import "server-only";

import type { PrismaClient } from "../generated/prisma/client";
import type { MediaPurpose, MediaRecord, MediaState } from "./types";

const OWNER_OBJECT_LIMIT = 256;
const OWNER_BYTE_LIMIT = BigInt(100 * 1024 * 1024);
const LOGO_OBJECT_LIMIT = 8;
const LOGO_BYTE_LIMIT = BigInt(10 * 1024 * 1024);

export class MediaAdmissionError extends Error {}

type Reservation = Omit<MediaRecord, "state" | "lifecycleRevision" | "purgeAfter">;

export type MediaStore = Readonly<{
  reserve(
    record: Reservation,
    verifyPhysicalInventory: (records: readonly MediaRecord[]) => Promise<boolean>,
  ): Promise<MediaRecord>;
  transition(
    ownerId: string,
    purpose: MediaPurpose,
    id: string,
    revision: bigint,
    from: readonly MediaState[],
    to: MediaState,
    purgeAfter: Date | null,
  ): Promise<MediaRecord | null>;
  findByIdentifier(identifier: string): Promise<MediaRecord | null>;
  recheck(identifier: string, revision: bigint, state: MediaState, ownerId?: string): Promise<boolean>;
  listAll(): Promise<readonly MediaRecord[]>;
  listReconciliationCandidates(cutoff: Date, now: Date): Promise<readonly MediaRecord[]>;
  claimDeleting(record: MediaRecord, now: Date): Promise<MediaRecord | null>;
  deleteClaim(record: MediaRecord): Promise<boolean>;
}>;

function recordFromPrisma(record: {
  id: string;
  identifier: string;
  storageKey: string;
  ownerId: string;
  purpose: string;
  state: string;
  lifecycleRevision: bigint;
  mimeType: string;
  byteSize: bigint;
  width: number;
  height: number;
  sha256: string;
  purgeAfter: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): MediaRecord {
  return record as MediaRecord;
}

export function mediaQuotaAllows(records: readonly MediaRecord[], candidate: Reservation): boolean {
  const owner = records.filter((record) => record.ownerId === candidate.ownerId);
  const ownerBytes = owner.reduce((sum, record) => sum + record.byteSize, BigInt(0)) + candidate.byteSize;
  if (owner.length + 1 > OWNER_OBJECT_LIMIT || ownerBytes > OWNER_BYTE_LIMIT) return false;
  if (candidate.purpose !== "STOREFRONT_LOGO") return true;
  const logos = owner.filter((record) => record.purpose === "STOREFRONT_LOGO");
  const logoBytes = logos.reduce((sum, record) => sum + record.byteSize, BigInt(0)) + candidate.byteSize;
  return logos.length + 1 <= LOGO_OBJECT_LIMIT && logoBytes <= LOGO_BYTE_LIMIT;
}

export function createPrismaMediaStore(prisma: PrismaClient): MediaStore {
  return {
    async reserve(record, verifyPhysicalInventory) {
      return prisma.$transaction(async (tx) => {
        const owner = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "app"."user"
          WHERE "id" = ${record.ownerId}::uuid AND "role" = 'USER' AND "status" = 'ACTIVE'
          FOR UPDATE
        `;
        if (!owner[0]) throw new MediaAdmissionError("Owner is unavailable");
        const current = (await tx.mediaObject.findMany()).map(recordFromPrisma);
        if (!(await verifyPhysicalInventory(current))) {
          throw new MediaAdmissionError("Physical media inventory is inconsistent");
        }
        if (!mediaQuotaAllows(current, record)) throw new MediaAdmissionError("Media quota is unavailable");
        return recordFromPrisma(await tx.mediaObject.create({
          data: {
            ...record,
            state: "WRITING",
            lifecycleRevision: BigInt(0),
            purgeAfter: null,
          },
        }));
      }, { isolationLevel: "Serializable" });
    },
    async transition(ownerId, purpose, id, revision, from, to, purgeAfter) {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "app"."user" WHERE "id" = ${ownerId}::uuid FOR UPDATE`;
        const changed = await tx.mediaObject.updateMany({
          where: { id, ownerId, purpose, state: { in: [...from] }, lifecycleRevision: revision },
          data: {
            state: to,
            lifecycleRevision: { increment: BigInt(1) },
            purgeAfter,
            updatedAt: new Date(),
          },
        });
        if (changed.count !== 1) return null;
        const current = await tx.mediaObject.findUnique({ where: { id } });
        return current ? recordFromPrisma(current) : null;
      }, { isolationLevel: "Serializable" });
    },
    async findByIdentifier(identifier) {
      const record = await prisma.mediaObject.findUnique({ where: { identifier } });
      return record ? recordFromPrisma(record) : null;
    },
    async recheck(identifier, revision, state, ownerId) {
      return (await prisma.mediaObject.count({
        where: { identifier, lifecycleRevision: revision, state, ...(ownerId ? { ownerId } : {}) },
      })) === 1;
    },
    async listAll() {
      return (await prisma.mediaObject.findMany()).map(recordFromPrisma);
    },
    async listReconciliationCandidates(cutoff, now) {
      return (await prisma.mediaObject.findMany({
        where: {
          OR: [
            { state: "WRITING", createdAt: { lte: cutoff } },
            { state: "ORPHANED", purgeAfter: { lte: now } },
            { state: "DELETING" },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })).map(recordFromPrisma);
    },
    claimDeleting(record, now) {
      return this.transition(
        record.ownerId,
        record.purpose,
        record.id,
        record.lifecycleRevision,
        [record.state],
        "DELETING",
        record.purgeAfter ?? now,
      );
    },
    async deleteClaim(record) {
      const deleted = await prisma.mediaObject.deleteMany({
        where: {
          id: record.id,
          ownerId: record.ownerId,
          purpose: record.purpose,
          state: "DELETING",
          lifecycleRevision: record.lifecycleRevision,
        },
      });
      return deleted.count === 1;
    },
  };
}
