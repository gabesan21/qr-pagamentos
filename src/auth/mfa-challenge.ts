import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getDatabaseClient } from "../db/client";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type MfaChallenge = Readonly<{
  id: string;
  userId: string;
  tokenDigest: string;
  expiresAt: Date;
  usedAt: Date | null;
}>;

export interface MfaChallengeStore {
  createChallenge(challenge: Omit<MfaChallenge, "id">): Promise<void>;
  findChallenge(tokenDigest: string): Promise<MfaChallenge | null>;
  markUsed(id: string, usedAt: Date): Promise<boolean>;
  revokeForUser(userId: string): Promise<void>;
}

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createMfaChallengeService(
  store: MfaChallengeStore,
  clock: () => Date = () => new Date(),
) {
  return {
    async create(userId: string): Promise<string> {
      const token = randomBytes(32).toString("base64url");
      const now = clock();
      await store.createChallenge({
        userId,
        tokenDigest: digest(token),
        expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
        usedAt: null,
      });
      return token;
    },

    async validate(token: string | undefined): Promise<{ userId: string } | null> {
      if (!token) return null;
      const challenge = await store.findChallenge(digest(token));
      if (!challenge || challenge.usedAt !== null || clock() >= challenge.expiresAt) return null;
      const marked = await store.markUsed(challenge.id, clock());
      if (!marked) return null;
      return { userId: challenge.userId };
    },

    async revoke(userId: string): Promise<void> {
      await store.revokeForUser(userId);
    },
  };
}

export type MfaChallengeService = ReturnType<typeof createMfaChallengeService>;

export function createPrismaMfaChallengeStore(db: ReturnType<typeof getDatabaseClient>): MfaChallengeStore {
  return {
    async createChallenge(challenge) {
      await db.mfaChallenge.create({
        data: { id: randomUUID(), ...challenge },
      });
    },
    async findChallenge(tokenDigest) {
      return db.mfaChallenge.findUnique({ where: { tokenDigest } });
    },
    async markUsed(id, usedAt) {
      const updated = await db.mfaChallenge.updateMany({
        where: { id, usedAt: null },
        data: { usedAt },
      });
      return updated.count === 1;
    },
    async revokeForUser(userId) {
      await db.mfaChallenge.deleteMany({ where: { userId } });
    },
  };
}

export function getMfaChallengeService() {
  return createMfaChallengeService(createPrismaMfaChallengeStore(getDatabaseClient()));
}
