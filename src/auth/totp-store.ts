import { getDatabaseClient } from "../db/client";
import { decrypt, encrypt, loadEncryptionKey } from "../lib/totp-crypto";
import { createTotpService, type TotpCredential, type TotpRecoveryCode, type TotpStore } from "./totp";

function mapCredential(row: {
  userId: string;
  encryptedSecret: string;
  confirmedAt: Date | null;
  replayCounter: bigint;
  algorithm: string;
  digits: number;
  stepSeconds: number;
}): TotpCredential {
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

export function createPrismaTotpStore(db: ReturnType<typeof getDatabaseClient>): TotpStore {
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
  };
}

export function getTotpService() {
  const db = getDatabaseClient();
  const key = loadEncryptionKey();
  return createTotpService(createPrismaTotpStore(db), {
    encrypt: (plaintext: string) => encrypt(plaintext, key),
    decrypt: (ciphertext: string) => decrypt(ciphertext, key),
  });
}
