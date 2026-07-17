import { describe, expect, it, vi } from "vitest";

import { hashPassword } from "./password";
import { acquireUserSessionLock, createSessionService, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, type SessionStore } from "./session";

type Row = { id: string; userId: string; tokenDigest: string; createdAt: Date; lastSeenAt: Date; absoluteExpiresAt: Date };

function memoryStore(): SessionStore & { rows: Row[]; credentials: Map<string, { id: string; status: string; passwordHash: string }> } {
  const rows: Row[] = [];
  const credentials = new Map<string, { id: string; status: string; passwordHash: string }>();
  let lock = Promise.resolve();
  return {
    rows, credentials,
    async findCredential(username) { return credentials.get(username) ?? null; },
    async findSession(tokenDigest) { return rows.find((row) => row.tokenDigest === tokenDigest) ?? null; },
    async createSession(row) { rows.push({ ...row, id: `session-${rows.length}` }); },
    async deleteSession(id) { const index = rows.findIndex((row) => row.id === id); if (index >= 0) rows.splice(index, 1); },
    async deleteByDigest(tokenDigest) { const index = rows.findIndex((row) => row.tokenDigest === tokenDigest); if (index >= 0) rows.splice(index, 1); },
    async touchSession(id, lastSeenAt) { const row = rows.find((candidate) => candidate.id === id); if (row) row.lastSeenAt = lastSeenAt; },
    async withUserLock(_userId, work) {
      const previous = lock;
      let release: () => void = () => undefined;
      lock = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await work(this); } finally { release(); }
    },
    async removeExpiredForUser(userId, now) { for (const row of [...rows]) if (row.userId === userId && (now >= row.absoluteExpiresAt || now.getTime() - row.lastSeenAt.getTime() >= SESSION_IDLE_MS)) await this.deleteSession(row.id); },
    async activeSessions(userId) { return rows.filter((row) => row.userId === userId); },
  };
}

describe("opaque database sessions", () => {
  it("performs password verification for an unknown canonical username", async () => {
    const verify = vi.fn().mockResolvedValue(false);
    const service = createSessionService(memoryStore(), () => new Date("2026-07-16T12:00:00Z"), verify);

    await expect(service.signIn("unknown.user", "correct horse battery staple")).resolves.toBeNull();
    expect(verify).toHaveBeenCalledOnce();
    expect(verify.mock.calls[0][1]).toMatch(/^scrypt\$v=1\$N=131072,r=8,p=1\$/);
  });

  it("acquires its transaction lock without deserializing PostgreSQL void", async () => {
    const executeRaw = async (strings: TemplateStringsArray, userId: string) => {
      expect(strings.join("?")).toBe("SELECT pg_advisory_xact_lock(hashtext(?))");
      expect(userId).toBe("user-1");
      return 1;
    };

    await acquireUserSessionLock({ $executeRaw: executeRaw }, "user-1");
  });

  it("creates digest-only sessions after normalized valid credentials", async () => {
    const store = memoryStore();
    store.credentials.set("admin.user", { id: "user-1", status: "ACTIVE", passwordHash: await hashPassword("correct horse battery staple") });
    const service = createSessionService(store, () => new Date("2026-07-16T12:00:00Z"));
    const token = await service.signIn(" Admin.User ", "correct horse battery staple");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].tokenDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(store.rows[0].tokenDigest).not.toBe(token);
    await expect(service.signIn("missing", "correct horse battery staple")).resolves.toBeNull();
    await expect(service.signIn("admin.user", "wrong password")).resolves.toBeNull();
    store.credentials.set("disabled", { id: "user-2", status: "DISABLED", passwordHash: await hashPassword("correct horse battery staple") });
    await expect(service.signIn("disabled", "correct horse battery staple")).resolves.toBeNull();
  });

  it("expires idle and absolute sessions, touches valid rows, and logs out idempotently", async () => {
    const store = memoryStore();
    let now = new Date("2026-07-16T12:00:00Z");
    const service = createSessionService(store, () => now);
    const token = await service.create("user-1");
    now = new Date(now.getTime() + SESSION_IDLE_MS - 1);
    await expect(service.validate(token)).resolves.toEqual({ userId: "user-1" });
    expect(store.rows[0].lastSeenAt).toEqual(now);
    now = new Date(now.getTime() + SESSION_IDLE_MS);
    await expect(service.validate(token)).resolves.toBeNull();
    expect(store.rows).toHaveLength(0);
    now = new Date("2026-07-16T12:00:00Z");
    const absoluteToken = await service.create("user-1");
    now = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
    await expect(service.validate(absoluteToken)).resolves.toBeNull();
    await service.logout(absoluteToken);
    await service.logout(absoluteToken);
  });

  it("keeps at most five sessions and deterministically evicts the oldest", async () => {
    const store = memoryStore();
    let now = new Date("2026-07-16T12:00:00Z");
    const service = createSessionService(store, () => now);
    const tokens: string[] = [];
    for (let index = 0; index < 6; index += 1) { tokens.push(await service.create("user-1")); now = new Date(now.getTime() + 1); }
    expect(store.rows).toHaveLength(5);
    await expect(service.validate(tokens[0])).resolves.toBeNull();
    await expect(service.validate(tokens[5])).resolves.toEqual({ userId: "user-1" });
  });

  it("serializes concurrent creation so the cap is never exceeded", async () => {
    const store = memoryStore();
    const service = createSessionService(store, () => new Date("2026-07-16T12:00:00Z"));
    await Promise.all(Array.from({ length: 12 }, () => service.create("user-1")));
    expect(store.rows).toHaveLength(5);
  });
});
