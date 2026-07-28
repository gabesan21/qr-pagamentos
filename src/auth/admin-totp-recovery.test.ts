import { describe, expect, it, vi } from "vitest";

import { createAdminTotpRecoveryService, type AdminTotpRecoveryStore, AdminTotpRecoveryTargetNotFoundError } from "./admin-totp-recovery";
import { ForbiddenError } from "./authorization";
import { type TotpCredential, type TotpRecoveryCode } from "./totp";

function memoryStore(): AdminTotpRecoveryStore & { credentials: Map<string, TotpCredential>; recoveryCodes: Map<string, TotpRecoveryCode[]>; actions: { actorId: string; targetId: string; action: string }[]; sessionsRevoked: Set<string>; users: Map<string, { deletedAt: Date | null }> } {
  const credentials = new Map<string, TotpCredential>();
  const recoveryCodes = new Map<string, TotpRecoveryCode[]>();
  const actions: { actorId: string; targetId: string; action: string }[] = [];
  const sessionsRevoked = new Set<string>();
  const users = new Map<string, { deletedAt: Date | null }>();
  return {
    credentials, recoveryCodes, actions, sessionsRevoked, users,
    async getCredential(userId) { return credentials.get(userId) ?? null; },
    async getRecoveryCodes(credentialId) { return recoveryCodes.get(credentialId) ?? []; },
    async beginEnrollment(userId, encryptedSecret, now, codes) {
      credentials.set(userId, { userId, encryptedSecret, confirmedAt: null, replayCounter: 0, algorithm: "SHA1", digits: 6, stepSeconds: 30 });
      recoveryCodes.set(userId, codes.map((code) => ({ id: code.id, credentialId: userId, codeDigest: code.codeDigest, consumedAt: null })));
    },
    async confirm() { return false; },
    async updateReplayCounter() {},
    async consumeRecoveryCode() {},
    async replaceRecoveryCodes(credentialId, codes) {
      recoveryCodes.set(
        credentialId,
        codes.map((code) => ({ id: code.id, credentialId, codeDigest: code.codeDigest, consumedAt: null })),
      );
    },
    async disable(userId) {
      credentials.delete(userId);
      recoveryCodes.delete(userId);
      sessionsRevoked.add(userId);
    },
    async findActiveUser(id) { const user = users.get(id); return user ? { id, ...user } : null; },
    async recordRecoveryAction(action) { actions.push({ actorId: action.actorId, targetId: action.targetId, action: action.action }); },
  };
}

describe("administrator TOTP recovery", () => {
  it("disables TOTP for an active merchant and records one audit action", async () => {
    const store = memoryStore();
    store.users.set("user-1", { deletedAt: null });
    await store.beginEnrollment("user-1", "encrypted-secret", new Date(), [{ id: "rc-1", codeDigest: "digest", createdAt: new Date() }]);
    const service = createAdminTotpRecoveryService(store);
    await service.disable({ id: "admin-1", role: "ADMIN", status: "ACTIVE", username: "admin", email: null, createdAt: new Date() }, "user-1");
    expect(store.credentials.has("user-1")).toBe(false);
    expect(store.sessionsRevoked.has("user-1")).toBe(true);
    expect(store.actions).toHaveLength(1);
    expect(store.actions[0]).toEqual({ actorId: "admin-1", targetId: "user-1", action: "DISABLE" });
  });

  it("rejects non-admin actors", async () => {
    const service = createAdminTotpRecoveryService(memoryStore());
    await expect(service.disable({ id: "user-1", role: "USER", status: "ACTIVE", username: "owner", email: null, createdAt: new Date() }, "user-1")).rejects.toThrow(ForbiddenError);
  });

  it("treats deleted targets as not found", async () => {
    const store = memoryStore();
    store.users.set("user-1", { deletedAt: new Date() });
    await store.beginEnrollment("user-1", "encrypted-secret", new Date(), [{ id: "rc-1", codeDigest: "digest", createdAt: new Date() }]);
    const service = createAdminTotpRecoveryService(store);
    await expect(service.disable({ id: "admin-1", role: "ADMIN", status: "ACTIVE", username: "admin", email: null, createdAt: new Date() }, "user-1")).rejects.toThrow(AdminTotpRecoveryTargetNotFoundError);
  });

  it("treats targets without TOTP as not found", async () => {
    const store = memoryStore();
    store.users.set("user-1", { deletedAt: null });
    const service = createAdminTotpRecoveryService(store);
    await expect(service.disable({ id: "admin-1", role: "ADMIN", status: "ACTIVE", username: "admin", email: null, createdAt: new Date() }, "user-1")).rejects.toThrow(AdminTotpRecoveryTargetNotFoundError);
  });
});
