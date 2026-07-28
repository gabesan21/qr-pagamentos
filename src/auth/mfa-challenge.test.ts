import { describe, expect, it, vi } from "vitest";

import { createMfaChallengeService, type MfaChallenge, type MfaChallengeStore } from "./mfa-challenge";

type Row = { id: string } & MfaChallenge;

function memoryStore(): MfaChallengeStore & { rows: Row[] } {
  const rows: Row[] = [];
  return {
    rows,
    async createChallenge(challenge) {
      rows.push({ id: `challenge-${rows.length}`, ...challenge });
    },
    async findChallenge(tokenDigest) {
      return rows.find((row) => row.tokenDigest === tokenDigest) ?? null;
    },
    async markUsed(id, usedAt) {
      const index = rows.findIndex((candidate) => candidate.id === id);
      if (index < 0 || rows[index].usedAt !== null) return false;
      rows[index] = { ...rows[index], usedAt };
      return true;
    },
    async revokeForUser(userId) {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].userId === userId) rows.splice(index, 1);
      }
    },
  };
}

describe("mfa challenge service", () => {
  it("creates and validates a challenge", async () => {
    const store = memoryStore();
    const now = new Date("2026-07-28T12:00:00Z");
    const service = createMfaChallengeService(store, () => now);
    const token = await service.create("user-1");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const result = await service.validate(token);
    expect(result).toEqual({ userId: "user-1" });
    expect(store.rows[0].usedAt).toEqual(now);
  });

  it("rejects a reused challenge", async () => {
    const store = memoryStore();
    const service = createMfaChallengeService(store, () => new Date("2026-07-28T12:00:00Z"));
    const token = await service.create("user-1");
    await service.validate(token);
    expect(await service.validate(token)).toBeNull();
  });

  it("rejects an expired challenge", async () => {
    const store = memoryStore();
    const created = new Date("2026-07-28T12:00:00Z");
    const service = createMfaChallengeService(store, () => created);
    const token = await service.create("user-1");
    const expired = createMfaChallengeService(store, () => new Date(created.getTime() + 6 * 60 * 1000));
    expect(await expired.validate(token)).toBeNull();
  });

  it("rejects missing or unknown tokens", async () => {
    const service = createMfaChallengeService(memoryStore(), () => new Date("2026-07-28T12:00:00Z"));
    expect(await service.validate(undefined)).toBeNull();
    expect(await service.validate("unknown-token")).toBeNull();
  });

  it("revokes challenges for a user", async () => {
    const store = memoryStore();
    const service = createMfaChallengeService(store, () => new Date("2026-07-28T12:00:00Z"));
    await service.create("user-1");
    await service.create("user-2");
    await service.revoke("user-1");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].userId).toBe("user-2");
  });
});
