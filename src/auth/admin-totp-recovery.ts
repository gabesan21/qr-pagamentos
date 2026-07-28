import { randomUUID } from "node:crypto";

import { getDatabaseClient } from "../db/client";
import { ForbiddenError, type Principal } from "./authorization";
import { type TotpStore } from "./totp";

export interface AdminTotpRecoveryStore extends TotpStore {
  findActiveUser(id: string): Promise<{ id: string; deletedAt: Date | null } | null>;
  recordRecoveryAction(action: { id: string; actorId: string; targetId: string; action: string; createdAt: Date }): Promise<void>;
}

export class AdminTotpRecoveryForbiddenError extends Error {}
export class AdminTotpRecoveryTargetNotFoundError extends Error {}

function requireAdmin(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

export function createAdminTotpRecoveryService(store: AdminTotpRecoveryStore) {
  return {
    async disable(actor: Principal, targetId: string): Promise<void> {
      requireAdmin(actor);
      const target = await store.findActiveUser(targetId);
      if (!target || target.deletedAt !== null) throw new AdminTotpRecoveryTargetNotFoundError("Target was not found");
      const credential = await store.getCredential(targetId);
      if (!credential) throw new AdminTotpRecoveryTargetNotFoundError("TOTP is not configured for target");
      await store.disable(targetId);
      await store.recordRecoveryAction({
        id: randomUUID(),
        actorId: actor.id,
        targetId,
        action: "DISABLE",
        createdAt: new Date(),
      });
    },
  };
}

export type AdminTotpRecoveryService = ReturnType<typeof createAdminTotpRecoveryService>;

function mapCredential(row: {
  userId: string;
  encryptedSecret: string;
  confirmedAt: Date | null;
  replayCounter: bigint;
  algorithm: string;
  digits: number;
  stepSeconds: number;
}) {
  return {
    userId: row.userId,
    encryptedSecret: row.encryptedSecret,
    confirmedAt: row.confirmedAt,
    replayCounter: Number(row.replayCounter),
    algorithm: row.algorithm,
    digits: row.digits,
    stepSeconds: row.stepSeconds,
  };
}

export function createPrismaAdminTotpRecoveryStore(db: ReturnType<typeof getDatabaseClient>): AdminTotpRecoveryStore {
  return {
    async getCredential(userId) {
      const row = await db.totpCredential.findUnique({ where: { userId } });
      return row ? mapCredential(row) : null;
    },
    async getRecoveryCodes(credentialId) {
      return db.totpRecoveryCode.findMany({ where: { credentialId } });
    },
    async beginEnrollment(userId, encryptedSecret, now, recoveryCodes) {
      await db.totpCredential.create({
        data: {
          userId,
          encryptedSecret,
          confirmedAt: null,
          replayCounter: 0,
          algorithm: "SHA1",
          digits: 6,
          stepSeconds: 30,
          createdAt: now,
          updatedAt: now,
        },
      });
      await db.totpRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          id: code.id,
          credentialId: userId,
          codeDigest: code.codeDigest,
          consumedAt: null,
          createdAt: code.createdAt,
        })),
      });
    },
    async confirm(userId, confirmedAt) {
      const updated = await db.totpCredential.updateMany({
        where: { userId, confirmedAt: null },
        data: { confirmedAt, updatedAt: confirmedAt },
      });
      return updated.count === 1;
    },
    async updateReplayCounter(userId, counter, now) {
      await db.totpCredential.updateMany({
        where: { userId },
        data: { replayCounter: BigInt(counter), updatedAt: now },
      });
    },
    async consumeRecoveryCode(id, consumedAt) {
      await db.totpRecoveryCode.updateMany({
        where: { id, consumedAt: null },
        data: { consumedAt },
      });
    },
    async disable(userId) {
      await db.$transaction(async (transaction) => {
        await transaction.totpCredential.deleteMany({ where: { userId } });
        await transaction.session.deleteMany({ where: { userId } });
      });
    },
    async findActiveUser(id) {
      return db.user.findFirst({
        where: { id, status: "ACTIVE" },
        select: { id: true, deletedAt: true },
      });
    },
    async recordRecoveryAction(action) {
      await db.totpRecoveryAction.create({ data: action });
    },
  };
}

export function getAdminTotpRecoveryService() {
  return createAdminTotpRecoveryService(createPrismaAdminTotpRecoveryStore(getDatabaseClient()));
}
