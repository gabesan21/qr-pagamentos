import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getDatabaseClient } from "../db/client";

import { acquireUserSessionLock } from "./session";
import {
  normalizeOptionalEmail,
  normalizeUsername,
  validatePassword,
} from "./identity";
import { hashPassword } from "./password";

export const RESET_TOKEN_BYTES = 32;
export const DEFAULT_RESET_LIMITS = {
  ttlMs: 60 * 60 * 1000,
  maxPendingPerUser: 3,
  minIntervalMs: 60 * 1000,
} as const;

export type PasswordResetLimits = Readonly<{
  ttlMs: number;
  maxPendingPerUser: number;
  minIntervalMs: number;
}>;

export type ResetUserReference = Readonly<{ id: string }>;

export type PasswordResetStore = Readonly<{
  findActiveUserByUsername(username: string): Promise<ResetUserReference | null>;
  findActiveUserByEmail(email: string): Promise<ResetUserReference | null>;
  createToken(
    userId: string,
    tokenDigest: string,
    expiresAt: Date,
    now: Date,
  ): Promise<"created" | "rate-limited">;
  findValidToken(tokenDigest: string, now: Date): Promise<ResetUserReference | null>;
  consumeToken(
    userId: string,
    tokenDigest: string,
    passwordHash: string,
    now: Date,
  ): Promise<boolean>;
}>;

export class PasswordResetValidationError extends Error {}
export class PasswordResetRateLimitError extends Error {}
export class PasswordResetUnavailableError extends Error {}

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function resolveIdentifier(input: string): { kind: "username"; value: string } | { kind: "email"; value: string } {
  try {
    return { kind: "username", value: normalizeUsername(input) };
  } catch {
    try {
      const email = normalizeOptionalEmail(input);
      if (email === null) throw new PasswordResetValidationError("Reset identifier is invalid");
      return { kind: "email", value: email };
    } catch {
      throw new PasswordResetValidationError("Reset identifier is invalid");
    }
  }
}

export function createPasswordResetService(
  store: PasswordResetStore,
  limits: PasswordResetLimits = DEFAULT_RESET_LIMITS,
  passwordHasher: (plaintext: string) => Promise<string> = hashPassword,
  clock: () => Date = () => new Date(),
) {
  return {
    async requestReset(identifierInput: string): Promise<{ token: string; expiresAt: Date }> {
      const identifier = resolveIdentifier(identifierInput);
      const user = identifier.kind === "username"
        ? await store.findActiveUserByUsername(identifier.value)
        : await store.findActiveUserByEmail(identifier.value);
      if (!user) throw new PasswordResetUnavailableError("Reset is unavailable");

      const now = clock();
      const token = randomBytes(RESET_TOKEN_BYTES).toString("base64url");
      const expiresAt = new Date(now.getTime() + limits.ttlMs);

      const outcome = await store.createToken(user.id, digest(token), expiresAt, now);
      if (outcome === "rate-limited") throw new PasswordResetRateLimitError("Reset rate limit exceeded");

      return { token, expiresAt };
    },

    async validateResetChallenge(token: string): Promise<ResetUserReference | null> {
      return store.findValidToken(digest(token), clock());
    },

    async consumeResetChallenge(token: string, newPassword: string): Promise<void> {
      let validPassword: string;
      try {
        validPassword = validatePassword(newPassword);
      } catch {
        throw new PasswordResetValidationError("Password is invalid");
      }

      const reference = await store.findValidToken(digest(token), clock());
      if (!reference) throw new PasswordResetUnavailableError("Reset is unavailable");

      const passwordHash = await passwordHasher(validPassword);
      const consumed = await store.consumeToken(reference.id, digest(token), passwordHash, clock());
      if (!consumed) throw new PasswordResetUnavailableError("Reset is unavailable");
    },
  };
}

export type PasswordResetService = ReturnType<typeof createPasswordResetService>;

export function createDatabasePasswordResetStore(
  db: ReturnType<typeof getDatabaseClient>,
  limits: PasswordResetLimits = DEFAULT_RESET_LIMITS,
): PasswordResetStore {
  return {
    async findActiveUserByUsername(username) {
      return db.user.findUnique({
        where: { username, status: "ACTIVE", role: "USER", deletedAt: null },
        select: { id: true },
      });
    },
    async findActiveUserByEmail(email) {
      return db.user.findUnique({
        where: { email, status: "ACTIVE", role: "USER", deletedAt: null },
        select: { id: true },
      });
    },
    async createToken(userId, tokenDigest, expiresAt, now) {
      return db.$transaction(async (transaction) => {
        const pending = await transaction.passwordResetToken.findMany({
          where: {
            userId,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limits.maxPendingPerUser,
        });
        if (pending.length >= limits.maxPendingPerUser) return "rate-limited";
        const newest = pending[0];
        if (newest && now.getTime() - newest.createdAt.getTime() < limits.minIntervalMs) return "rate-limited";

        await transaction.passwordResetToken.create({
          data: { userId, tokenDigest, expiresAt, createdAt: now },
        });
        return "created";
      });
    },
    async findValidToken(tokenDigest, now) {
      const row = await db.passwordResetToken.findUnique({
        where: {
          tokenDigest,
          consumedAt: null,
          expiresAt: { gt: now },
        },
      });
      if (!row) return null;
      const user = await db.user.findFirst({
        where: { id: row.userId, status: "ACTIVE", role: "USER", deletedAt: null },
        select: { id: true },
      });
      return user ? { id: user.id } : null;
    },
    async consumeToken(userId, tokenDigest, passwordHash, now) {
      return db.$transaction(async (transaction) => {
        await acquireUserSessionLock(transaction, userId);
        const token = await transaction.passwordResetToken.findUnique({
          where: {
            tokenDigest,
            consumedAt: null,
            expiresAt: { gt: now },
          },
        });
        if (!token || token.userId !== userId) return false;

        const credential = await transaction.passwordCredential.findUnique({
          where: { userId },
        });
        if (!credential) return false;

        await transaction.passwordResetToken.update({
          where: { id: token.id },
          data: { consumedAt: now },
        });
        await transaction.passwordCredential.update({
          where: { userId },
          data: { passwordHash },
        });
        await transaction.session.deleteMany({ where: { userId } });
        return true;
      });
    },
  };
}

export function getPasswordResetService(): PasswordResetService {
  return createPasswordResetService(createDatabasePasswordResetStore(getDatabaseClient()));
}
