import { describe, expect, it, vi } from "vitest";

import { createAdministrationService, type AdministrationStore } from "./administration";
import { hashPassword, verifyPassword } from "./password";
import { createProfileService, type LockedProfileStore, type ProfileStore } from "./profile";
import { createSessionService, type SessionStore } from "./session";

const merchant = {
  createdAt: new Date("2026-07-24T00:00:00Z"),
  email: null,
  id: "merchant",
  role: "USER" as const,
  status: "ACTIVE" as const,
  username: "merchant",
};
const admin = { ...merchant, id: "admin", role: "ADMIN" as const, username: "admin" };

function deferred() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function sharedHarness(initialPasswordHash: string) {
  let credential = initialPasswordHash;
  const rows: Array<{ id: string; userId: string; tokenDigest: string; createdAt: Date; lastSeenAt: Date; absoluteExpiresAt: Date }> = [];
  let tail = Promise.resolve();
  let pauseAdministrationUpdate: ReturnType<typeof deferred> | null = null;
  let administrationUpdateReached: ReturnType<typeof deferred> | null = null;

  async function withLock<T>(work: () => Promise<T>) {
    const previous = tail;
    let unlock: () => void = () => undefined;
    tail = new Promise<void>((resolve) => { unlock = resolve; });
    await previous;
    try { return await work(); } finally { unlock(); }
  }

  const lockedProfile: LockedProfileStore = {
    async getCredential() { return { passwordHash: credential }; },
    async replaceCredentialAndRevokeSessions(_id, expected, replacement) {
      if (credential !== expected) return false;
      credential = replacement;
      rows.splice(0);
      return true;
    },
  };
  const profileStore: ProfileStore = {
    async get() { return { username: merchant.username, email: null, version: 0 }; },
    async updateIdentity() { return "changed"; },
    async withUserLock(_id, work) { return withLock(() => work(lockedProfile)); },
  };
  const sessionStore: SessionStore = {
    async findCredential(username) {
      return username === merchant.username
        ? { id: merchant.id, status: merchant.status, passwordHash: credential }
        : null;
    },
    async findSession(tokenDigest) { return rows.find((row) => row.tokenDigest === tokenDigest) ?? null; },
    async createSession(row) { rows.push({ ...row, id: `session-${rows.length}` }); },
    async deleteSession(id) { const index = rows.findIndex((row) => row.id === id); if (index >= 0) rows.splice(index, 1); },
    async deleteByDigest(tokenDigest) { const index = rows.findIndex((row) => row.tokenDigest === tokenDigest); if (index >= 0) rows.splice(index, 1); },
    async touchSession() {},
    async withUserLock(_id, work) { return withLock(() => work(sessionStore)); },
    async removeExpiredForUser() {},
    async activeSessions(userId) { return rows.filter((row) => row.userId === userId); },
  };
  const mutationStore = {
    async listUsers() { return [admin, merchant]; },
    async findUser(id: string) { return id === merchant.id ? merchant : id === admin.id ? admin : null; },
    async countActiveAdmins() { return 1; },
    async updateStatus() {},
    async updateRole() {},
    async updatePassword(_id: string, passwordHash: string) {
      administrationUpdateReached?.release();
      if (pauseAdministrationUpdate) await pauseAdministrationUpdate.promise;
      credential = passwordHash;
    },
    async revokeSessions() { rows.splice(0); },
    async createUser() { return merchant; },
  };
  const administrationStore: AdministrationStore = {
    ...mutationStore,
    async withAuthorizationLock(work) { return withLock(() => work(mutationStore)); },
    async withUserLock(_id, work) { return withLock(() => work(mutationStore)); },
  };
  return {
    administrationStore,
    credential: () => credential,
    pauseAdministration() {
      pauseAdministrationUpdate = deferred();
      administrationUpdateReached = deferred();
      return { pause: pauseAdministrationUpdate, reached: administrationUpdateReached };
    },
    profileStore,
    rows,
    sessionStore,
  };
}

describe("credential and session serialization", () => {
  it("revokes a sign-in that completes before rotation and rejects old proof after rotation", async () => {
    const oldHash = await hashPassword("old password phrase");
    const harness = sharedHarness(oldHash);
    const signInReached = deferred();
    const releaseSignIn = deferred();
    const session = createSessionService(harness.sessionStore, () => new Date("2026-07-24T00:00:00Z"), async (plaintext, record) => {
      signInReached.release();
      await releaseSignIn.promise;
      return plaintext === "old password phrase" && record === oldHash;
    });
    const profile = createProfileService(harness.profileStore, async (plaintext, record, before) => {
      before?.();
      return plaintext === "old password phrase" && record === oldHash;
    }, async () => "rotated-hash");

    const signingIn = session.signIn("merchant", "old password phrase");
    await signInReached.promise;
    const rotating = profile.changePassword(merchant, {
      currentPassword: "old password phrase",
      newPassword: "new password phrase",
      confirmation: "new password phrase",
    });
    releaseSignIn.release();
    await expect(signingIn).resolves.toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(rotating).resolves.toBeUndefined();
    expect(harness.rows).toHaveLength(0);

    const after = createSessionService(harness.sessionStore, undefined, async (plaintext, record) => plaintext === "new password phrase" && record === "rotated-hash");
    await expect(after.signIn("merchant", "old password phrase")).resolves.toBeNull();
    await expect(after.signIn("merchant", "new password phrase")).resolves.toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("fences both administrator-reset/rotation lock orderings", async () => {
    const oldHash = await hashPassword("old password phrase");

    const adminFirst = sharedHarness(oldHash);
    const adminGate = adminFirst.pauseAdministration();
    const adminChange = createAdministrationService(adminFirst.administrationStore)
      .changePassword(admin, merchant.id, "administrator reset");
    await adminGate.reached.promise;
    const rotationAfter = createProfileService(adminFirst.profileStore).changePassword(merchant, {
      currentPassword: "old password phrase",
      newPassword: "merchant replacement",
      confirmation: "merchant replacement",
    }, vi.fn());
    adminGate.pause.release();
    await adminChange;
    await expect(rotationAfter).rejects.toThrow("Password change is unavailable");
    await expect(verifyPassword("administrator reset", adminFirst.credential())).resolves.toBe(true);

    const rotationFirst = sharedHarness(oldHash);
    const hashReached = deferred();
    const releaseHash = deferred();
    const rotating = createProfileService(rotationFirst.profileStore, verifyPassword, async (plaintext) => {
      hashReached.release();
      await releaseHash.promise;
      return hashPassword(plaintext);
    }).changePassword(merchant, {
      currentPassword: "old password phrase",
      newPassword: "merchant replacement",
      confirmation: "merchant replacement",
    });
    await hashReached.promise;
    const resetting = createAdministrationService(rotationFirst.administrationStore)
      .changePassword(admin, merchant.id, "administrator reset");
    releaseHash.release();
    await rotating;
    await resetting;
    await expect(verifyPassword("administrator reset", rotationFirst.credential())).resolves.toBe(true);
    await expect(verifyPassword("merchant replacement", rotationFirst.credential())).resolves.toBe(false);
    expect(rotationFirst.rows).toHaveLength(0);
  }, 20_000);
});
