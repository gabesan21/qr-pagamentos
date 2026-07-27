import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hashPassword } from "./password";
import {
  createPasswordResetService,
  PasswordResetRateLimitError,
  PasswordResetUnavailableError,
  PasswordResetValidationError,
  type PasswordResetStore,
  type ResetUserReference,
} from "./password-reset";

const DEFAULT_LIMITS = { ttlMs: 60 * 60 * 1000, maxPendingPerUser: 3, minIntervalMs: 60 * 1000 } as const;

type TokenRow = {
  id: string;
  userId: string;
  tokenDigest: string;
  expiresAt: Date;
  createdAt: Date;
  consumedAt: Date | null;
};

function memoryStore(initial: {
  users: ReadonlyArray<ResetUserReference & { username?: string; email?: string }>;
  tokens: TokenRow[];
  credential: string | null;
  sessions: number;
}) {
  let idSequence = 0;
  const users = [...initial.users];
  const tokens = [...initial.tokens];
  let credential = initial.credential;
  let sessions = initial.sessions;
  let forceRace = false;

  const store: PasswordResetStore & {
    tokens(): TokenRow[];
    credential(): string | null;
    sessions(): number;
    race(): void;
  } = {
    tokens: () => tokens,
    credential: () => credential,
    sessions: () => sessions,
    race: () => { forceRace = true; },
    async findActiveUserByUsername(username) {
      return users.find((u) => u.username === username) ?? null;
    },
    async findActiveUserByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },
    async createToken(userId, tokenDigest, expiresAt, now) {
      const pending = tokens
        .filter((t) => t.userId === userId && t.consumedAt === null && t.expiresAt > now)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
      if (pending.length >= DEFAULT_LIMITS.maxPendingPerUser) return "rate-limited";
      const newest = pending[0];
      if (newest && now.getTime() - newest.createdAt.getTime() < DEFAULT_LIMITS.minIntervalMs) return "rate-limited";
      tokens.push({ id: `token-${(idSequence += 1)}`, userId, tokenDigest, expiresAt, createdAt: now, consumedAt: null });
      return "created";
    },
    async findValidToken(tokenDigest, now) {
      const token = tokens.find((t) => t.tokenDigest === tokenDigest && t.consumedAt === null && t.expiresAt > now);
      const user = token ? users.find((u) => u.id === token.userId) ?? null : null;
      return user ? { id: user.id } : null;
    },
    async consumeToken(userId, tokenDigest, passwordHash, now) {
      if (forceRace) return false;
      const token = tokens.find((t) => t.tokenDigest === tokenDigest && t.consumedAt === null && t.expiresAt > now);
      if (!token || token.userId !== userId) return false;
      if (credential === null) return false;
      token.consumedAt = now;
      credential = passwordHash;
      sessions = 0;
      return true;
    },
  };
  return store;
}

describe("password reset service", () => {
  it("issues a hashed, expiring challenge for an active user by username", async () => {
    const store = memoryStore({ users: [{ id: "owner", username: "owner" }], tokens: [], credential: "old-hash", sessions: 2 });
    const service = createPasswordResetService(store, DEFAULT_LIMITS);
    const challenge = await service.requestReset(" Owner ");

    expect(challenge.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const [row] = store.tokens();
    expect(row.userId).toBe("owner");
    expect(row.tokenDigest).toHaveLength(64);
    expect(row.tokenDigest).not.toBe(challenge.token);
    expect(row.consumedAt).toBeNull();
  });

  it("issues a challenge for an active user by email", async () => {
    const store = memoryStore({ users: [{ id: "email-owner", email: "owner@example.com" }], tokens: [], credential: "old-hash", sessions: 2 });
    const service = createPasswordResetService(store, DEFAULT_LIMITS);
    const challenge = await service.requestReset("OWNER@EXAMPLE.COM");
    expect(store.tokens()[0].userId).toBe("email-owner");
    expect(challenge.token).toBeDefined();
  });

  it("rejects invalid identifiers", async () => {
    const store = memoryStore({ users: [{ id: "owner", username: "owner" }], tokens: [], credential: "old-hash", sessions: 2 });
    const service = createPasswordResetService(store, DEFAULT_LIMITS);
    await expect(service.requestReset("")).rejects.toBeInstanceOf(PasswordResetValidationError);
    await expect(service.requestReset("a")).rejects.toBeInstanceOf(PasswordResetValidationError);
    await expect(service.requestReset("not an email")).rejects.toBeInstanceOf(PasswordResetValidationError);
  });

  it("hides unknown users behind an unavailable outcome", async () => {
    const store = memoryStore({ users: [], tokens: [], credential: null, sessions: 0 });
    const service = createPasswordResetService(store, DEFAULT_LIMITS);
    await expect(service.requestReset("owner")).rejects.toBeInstanceOf(PasswordResetUnavailableError);
    await expect(service.requestReset("owner@example.com")).rejects.toBeInstanceOf(PasswordResetUnavailableError);
  });

  it("enforces pending-token and interval abuse limits", async () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    const clock = vi.fn(() => now);
    const store = memoryStore({ users: [{ id: "owner", username: "owner" }], tokens: [], credential: "old-hash", sessions: 2 });
    const service = createPasswordResetService(store, DEFAULT_LIMITS, hashPassword, clock);

    await service.requestReset("owner");
    clock.mockReturnValue(new Date(now.getTime() + 100));
    await expect(service.requestReset("owner")).rejects.toBeInstanceOf(PasswordResetRateLimitError);

    clock.mockReturnValue(new Date(now.getTime() + DEFAULT_LIMITS.minIntervalMs + 100));
    await service.requestReset("owner");
    clock.mockReturnValue(new Date(now.getTime() + DEFAULT_LIMITS.minIntervalMs * 2 + 200));
    await service.requestReset("owner");

    clock.mockReturnValue(new Date(now.getTime() + DEFAULT_LIMITS.minIntervalMs * 3 + 300));
    await expect(service.requestReset("owner")).rejects.toBeInstanceOf(PasswordResetRateLimitError);
    expect(store.tokens().filter((t) => t.consumedAt === null)).toHaveLength(3);
  });

  it("validates only live, unconsumed, unexpired challenges", async () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    const store = memoryStore({ users: [{ id: "owner", username: "owner" }], tokens: [], credential: "old-hash", sessions: 2 });
    const service = createPasswordResetService(store, DEFAULT_LIMITS, hashPassword, () => now);

    const live = await service.requestReset("owner");
    await expect(service.validateResetChallenge(live.token)).resolves.toEqual({ id: "owner" });
    await expect(service.validateResetChallenge("not-a-token")).resolves.toBeNull();

    const recentService = createPasswordResetService(
      store,
      DEFAULT_LIMITS,
      hashPassword,
      () => new Date(now.getTime() + DEFAULT_LIMITS.minIntervalMs + 1),
    );
    const expired = await recentService.requestReset("owner");
    const expiredService = createPasswordResetService(
      store,
      DEFAULT_LIMITS,
      hashPassword,
      () => new Date(now.getTime() + DEFAULT_LIMITS.ttlMs + DEFAULT_LIMITS.minIntervalMs + 2),
    );
    await expect(expiredService.validateResetChallenge(expired.token)).resolves.toBeNull();
  });

  it("consumes a valid challenge, rotates the password, and revokes sessions", async () => {
    const store = memoryStore({ users: [{ id: "owner", username: "owner" }], tokens: [], credential: "old-hash", sessions: 2 });
    const service = createPasswordResetService(store, DEFAULT_LIMITS, async () => "new-hash", () => new Date());
    const { token } = await service.requestReset("owner");

    await service.consumeResetChallenge(token, "new strong password");
    expect(store.credential()).toBe("new-hash");
    expect(store.sessions()).toBe(0);
    expect(store.tokens()[0].consumedAt).not.toBeNull();
    await expect(service.validateResetChallenge(token)).resolves.toBeNull();
  });

  it("rejects consumption with invalid password grammar", async () => {
    const store = memoryStore({ users: [{ id: "owner", username: "owner" }], tokens: [], credential: "old-hash", sessions: 2 });
    const service = createPasswordResetService(store, DEFAULT_LIMITS);
    const { token } = await service.requestReset("owner");
    await expect(service.consumeResetChallenge(token, "short")).rejects.toBeInstanceOf(PasswordResetValidationError);
    expect(store.credential()).toBe("old-hash");
    expect(store.sessions()).toBe(2);
  });

  it("rejects consumption of missing, expired, or already-consumed challenges", async () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    const store = memoryStore({ users: [{ id: "owner", username: "owner" }], tokens: [], credential: "old-hash", sessions: 2 });
    const service = createPasswordResetService(store, DEFAULT_LIMITS, hashPassword, () => now);
    const { token } = await service.requestReset("owner");

    await expect(service.consumeResetChallenge("not-a-token", "new strong password")).rejects.toBeInstanceOf(PasswordResetUnavailableError);

    await service.consumeResetChallenge(token, "new strong password");
    await expect(service.consumeResetChallenge(token, "another strong password")).rejects.toBeInstanceOf(PasswordResetUnavailableError);

    const expiredService = createPasswordResetService(
      store,
      DEFAULT_LIMITS,
      hashPassword,
      () => new Date(now.getTime() + DEFAULT_LIMITS.ttlMs + 1),
    );
    const { token: expiredToken } = await service.requestReset("owner");
    await expect(expiredService.consumeResetChallenge(expiredToken, "new strong password")).rejects.toBeInstanceOf(PasswordResetUnavailableError);
  });

  it("reports unavailable when the token wins a race or the credential is missing", async () => {
    const store = memoryStore({ users: [{ id: "owner", username: "owner" }], tokens: [], credential: "old-hash", sessions: 2 });
    store.race();
    const service = createPasswordResetService(store, DEFAULT_LIMITS, async () => "new-hash", () => new Date());
    const { token } = await service.requestReset("owner");
    await expect(service.consumeResetChallenge(token, "new strong password")).rejects.toBeInstanceOf(PasswordResetUnavailableError);
  });
});
