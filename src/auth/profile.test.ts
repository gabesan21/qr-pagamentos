import { describe, expect, it, vi } from "vitest";

import { hashPassword, verifyPassword } from "./password";
import {
  createProfileService,
  ProfileConflictError,
  ProfilePasswordError,
  ProfileUnavailableError,
  ProfileValidationError,
  type LockedProfileStore,
  type MerchantProfile,
  type ProfileStore,
} from "./profile";

const actor = {
  createdAt: new Date("2026-07-24T00:00:00Z"),
  email: "owner@example.com",
  id: "owner",
  role: "USER" as const,
  status: "ACTIVE" as const,
  username: "owner",
};

function memoryStore(initial: MerchantProfile | null, passwordHash: string | null) {
  let profile = initial;
  let credential = passwordHash;
  let sessions = 3;
  let forceStaleCredential = false;
  const locked: LockedProfileStore = {
    async getCredential() { return credential === null ? null : { passwordHash: credential }; },
    async replaceCredentialAndRevokeSessions(_id, expected, replacement) {
      if (forceStaleCredential || credential !== expected) return false;
      credential = replacement;
      sessions = 0;
      return true;
    },
  };
  const store: ProfileStore & {
    credential(): string | null;
    profile(): MerchantProfile | null;
    sessions(): number;
    stale(): void;
  } = {
    credential: () => credential,
    profile: () => profile,
    sessions: () => sessions,
    stale: () => { forceStaleCredential = true; },
    async get() { return profile; },
    async updateIdentity(_id, version, values) {
      if (!profile) return "unavailable";
      if (version !== profile.version) return "conflict";
      profile = { ...values, version: profile.version + 1 };
      return "changed";
    },
    async withUserLock(_id, work) { return work(locked); },
  };
  return store;
}

describe("merchant profile service", () => {
  it("reads only the active merchant's redacted own profile", async () => {
    const store = memoryStore({ username: "owner", email: null, version: 0 }, null);
    await expect(createProfileService(store).get(actor)).resolves.toEqual({ username: "owner", email: null, version: 0 });
    await expect(createProfileService(memoryStore(null, null)).get(actor)).rejects.toBeInstanceOf(ProfileUnavailableError);
    await expect(createProfileService(store).get({ ...actor, role: "ADMIN" })).rejects.toThrow("Merchant access is required");
  });

  it("normalizes identity, increments exact CAS, and keeps conflicts opaque", async () => {
    const store = memoryStore({ username: "owner", email: null, version: 4 }, null);
    const service = createProfileService(store);
    await service.updateIdentity(actor, { username: " New.Owner ", email: " NEW@EXAMPLE.COM ", expectedVersion: "4" });
    expect(store.profile()).toEqual({ username: "new.owner", email: "new@example.com", version: 5 });
    await expect(service.updateIdentity(actor, { username: "other", email: "", expectedVersion: "4" })).rejects.toBeInstanceOf(ProfileConflictError);
    await expect(service.updateIdentity(actor, { username: "bad name", email: "", expectedVersion: "5" })).rejects.toBeInstanceOf(ProfileValidationError);
  });

  it("executes exactly one verification KDF for every failure class and never replaces", async () => {
    const validHash = await hashPassword("current password phrase");
    const cases = [
      { currentPassword: "wrong password phrase", newPassword: "replacement password", confirmation: "replacement password" },
      { currentPassword: "short", newPassword: "replacement password", confirmation: "replacement password" },
      { currentPassword: "current password phrase", newPassword: "short", confirmation: "short" },
      { currentPassword: "current password phrase", newPassword: "replacement password", confirmation: "different password" },
      { currentPassword: "current password phrase", newPassword: "current password phrase", confirmation: "current password phrase" },
    ];
    for (const input of cases) {
      const store = memoryStore({ username: "owner", email: null, version: 0 }, validHash);
      const work = vi.fn();
      await expect(createProfileService(store).changePassword(actor, input, work)).rejects.toBeInstanceOf(ProfilePasswordError);
      expect(work, JSON.stringify(input)).toHaveBeenCalledOnce();
      expect(store.credential()).toBe(validHash);
      expect(store.sessions()).toBe(3);
    }

    for (const record of ["malformed", null] as const) {
      const store = memoryStore({ username: "owner", email: null, version: 0 }, record);
      const work = vi.fn();
      await expect(createProfileService(store).changePassword(actor, {
        currentPassword: "current password phrase",
        newPassword: "replacement password",
        confirmation: "replacement password",
      }, work)).rejects.toBeInstanceOf(ProfilePasswordError);
      expect(work).toHaveBeenCalledOnce();
    }

    const stale = memoryStore({ username: "owner", email: null, version: 0 }, validHash);
    stale.stale();
    const work = vi.fn();
    await expect(createProfileService(stale).changePassword(actor, {
      currentPassword: "current password phrase",
      newPassword: "replacement password",
      confirmation: "replacement password",
    }, work)).rejects.toBeInstanceOf(ProfilePasswordError);
    expect(work).toHaveBeenCalledOnce();
    expect(stale.sessions()).toBe(3);
  }, 20_000);

  it("replaces only after exact current proof and revokes every session atomically", async () => {
    const validHash = await hashPassword("current password phrase");
    const store = memoryStore({ username: "owner", email: null, version: 0 }, validHash);
    const work = vi.fn();
    await createProfileService(store, verifyPassword, async () => "replacement-record").changePassword(actor, {
      currentPassword: "current password phrase",
      newPassword: "replacement password",
      confirmation: "replacement password",
    }, work);
    expect(work).toHaveBeenCalledOnce();
    expect(store.credential()).toBe("replacement-record");
    expect(store.sessions()).toBe(0);
  }, 10_000);
});
