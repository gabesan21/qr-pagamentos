import { describe, expect, it, vi } from "vitest";

import { acquireAuthorizationLock, AdministrationTargetNotFoundError, createAdministrationService, FinalAdministratorError, type AdministrationStore } from "./administration";

const createdAt = new Date("2026-07-16T00:00:00Z");
type TestUser = { id: string; username: string; email: string | null; role: "ADMIN" | "USER"; status: "ACTIVE" | "DISABLED"; deletedAt: Date | null; createdAt: Date };
const admin: TestUser = { id: "admin", username: "admin", email: null, role: "ADMIN", status: "ACTIVE", deletedAt: null, createdAt };
const merchant: TestUser = { ...admin, id: "target", username: "target", role: "USER" };

function storeWith(users: TestUser[] = [admin]): AdministrationStore & {
  sessions: string[];
  lockScopes: number;
  storefrontEnabled: Map<string, boolean>;
  activeV1Links: Map<string, number>;
  activeV2Links: Map<string, number>;
  deletions: Array<{ id: string; userId: string; actorId: string; createdAt: Date }>;
  failDeletion(): void;
  validatesTargetToken(): boolean;
} {
  const sessions = users.map((user) => user.id);
  const data = new Map(users.map((user) => [user.id, { ...user }]));
  const storefrontEnabled = new Map(users.map((user) => [user.id, true]));
  const activeV1Links = new Map(users.map((user) => [user.id, 2]));
  const activeV2Links = new Map(users.map((user) => [user.id, 1]));
  const deletions: Array<{ id: string; userId: string; actorId: string; createdAt: Date }> = [];
  let deletionFails = false;
  let lockScopes = 0;
  const mutationStore = {
    async listUsers() { return [...data.values()]; },
    async findUser(id: string) { return data.get(id) ?? null; },
    async countActiveAdmins() { return [...data.values()].filter((user) => user.role === "ADMIN" && user.status === "ACTIVE").length; },
    async updateStatus(id: string, status: "ACTIVE" | "DISABLED") { const user = data.get(id); if (user) user.status = status; },
    async updateRole(id: string, role: "ADMIN" | "USER") { const user = data.get(id); if (user) user.role = role; },
    async updatePassword() {},
    async markDeleted(id: string, deletedAt: Date) { const user = data.get(id); if (user) { user.deletedAt = deletedAt; user.status = "DISABLED"; } },
    async disableStorefront(id: string) { storefrontEnabled.set(id, false); },
    async deactivatePaymentLinks(ownerId: string) { activeV1Links.set(ownerId, 0); },
    async deactivatePaymentLinksV2(ownerId: string) { activeV2Links.set(ownerId, 0); },
    async recordDeletion(row: { id: string; userId: string; actorId: string; createdAt: Date }) {
      if (deletionFails) throw new Error("audit write failed");
      deletions.push(row);
    },
    async revokeSessions(id: string) { for (let index = sessions.length - 1; index >= 0; index -= 1) if (sessions[index] === id) sessions.splice(index, 1); },
    async createUser(input: { username: string; email: string | null; role: "ADMIN" | "USER" }) {
      const user: TestUser = { id: `user-${data.size}`, username: input.username, email: input.email, role: input.role, status: "ACTIVE", deletedAt: null, createdAt };
      data.set(user.id, user);
      return user;
    },
  };
  function snapshot() {
    return {
      data: new Map([...data].map(([id, user]) => [id, { ...user }])),
      sessions: [...sessions],
      storefrontEnabled: new Map(storefrontEnabled),
      activeV1Links: new Map(activeV1Links),
      activeV2Links: new Map(activeV2Links),
      deletions: deletions.length,
    };
  }
  function restore(saved: ReturnType<typeof snapshot>) {
    data.clear();
    for (const [id, user] of saved.data) data.set(id, user);
    sessions.splice(0, sessions.length, ...saved.sessions);
    storefrontEnabled.clear();
    for (const [id, value] of saved.storefrontEnabled) storefrontEnabled.set(id, value);
    activeV1Links.clear();
    for (const [id, value] of saved.activeV1Links) activeV1Links.set(id, value);
    activeV2Links.clear();
    for (const [id, value] of saved.activeV2Links) activeV2Links.set(id, value);
    deletions.length = saved.deletions;
  }
  return {
    ...mutationStore,
    sessions,
    storefrontEnabled,
    activeV1Links,
    activeV2Links,
    deletions,
    failDeletion: () => { deletionFails = true; },
    validatesTargetToken: () => sessions.includes("target"),
    get lockScopes() { return lockScopes; },
    async withAuthorizationLock(work) {
      lockScopes += 1;
      const saved = snapshot();
      try { return await work(mutationStore); } catch (error) { restore(saved); throw error; }
    },
    async withUserLock(_userId, work) { lockScopes += 1; return work(mutationStore); },
  };
}

describe("identity administration", () => {
  it("acquires its authorization lock without deserializing PostgreSQL void", async () => {
    const queryRaw = vi.fn(async () => {
      throw new Error("void-returning advisory lock must not be read through $queryRaw");
    });
    const transaction = {
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        expect(strings.join("?")).toBe("SELECT pg_advisory_xact_lock(hashtext('qr:authorization:active-admin'))");
        expect(values).toHaveLength(0);
        return 1;
      },
      $queryRaw: queryRaw,
    };

    await acquireAuthorizationLock(transaction);

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("revokes every affected session", async () => {
    for (const change of ["password", "role", "status"] as const) {
      const store = storeWith([admin, merchant]);
      const service = createAdministrationService(store);
      if (change === "password") await service.changePassword(admin, "target", "correct horse battery staple");
      if (change === "role") await service.changeRole(admin, "target", "USER");
      if (change === "status") await service.changeStatus(admin, "target", "DISABLED");
      expect(store.sessions).toEqual(["admin"]);
      expect(store.validatesTargetToken()).toBe(false);
    }
  });

  it("protects the final active administrator", async () => {
    const onlyAdmin = storeWith();
    const service = createAdministrationService(onlyAdmin);
    await expect(service.changeStatus(admin, "admin", "DISABLED")).rejects.toBeInstanceOf(FinalAdministratorError);
    await expect(service.changeRole(admin, "admin", "USER")).rejects.toBeInstanceOf(FinalAdministratorError);
    const twoAdmins = storeWith([admin, { ...admin, id: "admin-2", username: "admin-2" }]);
    await expect(createAdministrationService(twoAdmins).changeStatus(admin, "admin-2", "DISABLED")).resolves.toBeUndefined();
    expect(twoAdmins.lockScopes).toBe(1);
  });

  it("rejects unknown password, role, and status targets", async () => {
    const service = createAdministrationService(storeWith());
    await expect(service.changePassword(admin, "unknown", "correct horse battery staple")).rejects.toBeInstanceOf(AdministrationTargetNotFoundError);
    await expect(service.changeRole(admin, "unknown", "USER")).rejects.toBeInstanceOf(AdministrationTargetNotFoundError);
    await expect(service.changeStatus(admin, "unknown", "DISABLED")).rejects.toBeInstanceOf(AdministrationTargetNotFoundError);
  });

  it("creates normalized safe account facts only for an active administrator", async () => {
    const store = storeWith();
    const service = createAdministrationService(store);
    await expect(service.createUser(admin, { username: " New.User ", email: " NEW@example.com ", password: "correct horse battery staple", role: "USER" })).resolves.toMatchObject({ username: "new.user", email: "new@example.com", role: "USER", status: "ACTIVE", deletedAt: null });
    await expect(service.createUser({ ...admin, role: "USER" }, { username: "other.user", password: "correct horse battery staple", role: "USER" })).rejects.toThrow("Administrator access is required");
    await expect(service.createUser(admin, { username: "bad name", password: "short", role: "OTHER" })).rejects.toThrow("Invalid role");
  });
});

describe("user soft deletion", () => {
  it("marks the target terminally, withdraws every public surface, audits, and revokes sessions in one lock scope", async () => {
    const store = storeWith([admin, merchant]);
    const service = createAdministrationService(store);

    await service.deleteUser(admin, "target");

    const target = await store.findUser("target");
    expect(target?.status).toBe("DISABLED");
    expect(target?.deletedAt).toBeInstanceOf(Date);
    expect(store.storefrontEnabled.get("target")).toBe(false);
    expect(store.activeV1Links.get("target")).toBe(0);
    expect(store.activeV2Links.get("target")).toBe(0);
    expect(store.deletions).toHaveLength(1);
    expect(store.deletions[0]).toMatchObject({ userId: "target", actorId: "admin", createdAt: target?.deletedAt });
    expect(store.deletions[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.sessions).toEqual(["admin"]);
    expect(store.lockScopes).toBe(1);
  });

  it("exposes deletedAt on the administrator directory DTO and nothing beyond the documented fields", async () => {
    const store = storeWith([admin, merchant]);
    const service = createAdministrationService(store);
    await service.deleteUser(admin, "target");

    const users = await service.listUsers(admin);
    expect(users).toHaveLength(2);
    for (const user of users) expect(Object.keys(user).sort()).toEqual(["createdAt", "deletedAt", "email", "id", "role", "status", "username"]);
    expect(users.find((user) => user.id === "target")?.deletedAt).toBeInstanceOf(Date);
    expect(users.find((user) => user.id === "admin")?.deletedAt).toBeNull();
  });

  it("rejects deleting the final active administrator without mutating anything", async () => {
    const store = storeWith();
    const service = createAdministrationService(store);

    await expect(service.deleteUser(admin, "admin")).rejects.toBeInstanceOf(FinalAdministratorError);
    expect(await store.findUser("admin")).toMatchObject({ status: "ACTIVE", deletedAt: null });
    expect(store.deletions).toHaveLength(0);
    expect(store.storefrontEnabled.get("admin")).toBe(true);
    expect(store.activeV1Links.get("admin")).toBe(2);
  });

  it("shares one opaque not-found outcome for unknown and already-deleted targets", async () => {
    const store = storeWith([admin, merchant]);
    const service = createAdministrationService(store);

    await expect(service.deleteUser(admin, "unknown")).rejects.toBeInstanceOf(AdministrationTargetNotFoundError);
    await service.deleteUser(admin, "target");
    await expect(service.deleteUser(admin, "target")).rejects.toBeInstanceOf(AdministrationTargetNotFoundError);
    expect(store.deletions).toHaveLength(1);
  });

  it("rolls back the whole deletion when any write inside the transaction fails", async () => {
    const store = storeWith([admin, merchant]);
    store.failDeletion();
    const service = createAdministrationService(store);

    await expect(service.deleteUser(admin, "target")).rejects.toThrow("audit write failed");
    expect(await store.findUser("target")).toMatchObject({ status: "ACTIVE", deletedAt: null });
    expect(store.storefrontEnabled.get("target")).toBe(true);
    expect(store.activeV1Links.get("target")).toBe(2);
    expect(store.activeV2Links.get("target")).toBe(1);
    expect(store.deletions).toHaveLength(0);
    expect(store.validatesTargetToken()).toBe(true);
  });

  it("lets a non-final administrator delete itself and loses its own sessions atomically", async () => {
    const secondAdmin: TestUser = { ...admin, id: "admin-2", username: "admin-2" };
    const store = storeWith([admin, secondAdmin]);
    const service = createAdministrationService(store);

    await service.deleteUser(admin, "admin");

    expect(await store.findUser("admin")).toMatchObject({ status: "DISABLED", deletedAt: expect.any(Date) });
    expect(store.sessions).toEqual(["admin-2"]);
    expect(store.deletions[0]).toMatchObject({ userId: "admin", actorId: "admin" });
  });

  it("fences every later mutation against a deleted target while reversible suspension still works", async () => {
    const store = storeWith([admin, merchant]);
    const service = createAdministrationService(store);
    await service.deleteUser(admin, "target");

    await expect(service.changeStatus(admin, "target", "ACTIVE")).rejects.toBeInstanceOf(AdministrationTargetNotFoundError);
    await expect(service.changeStatus(admin, "target", "DISABLED")).rejects.toBeInstanceOf(AdministrationTargetNotFoundError);
    await expect(service.changeRole(admin, "target", "ADMIN")).rejects.toBeInstanceOf(AdministrationTargetNotFoundError);
    await expect(service.changePassword(admin, "target", "correct horse battery staple")).rejects.toBeInstanceOf(AdministrationTargetNotFoundError);

    const suspended = storeWith([admin, merchant]);
    const suspendedService = createAdministrationService(suspended);
    await suspendedService.changeStatus(admin, "target", "DISABLED");
    await suspendedService.changeStatus(admin, "target", "ACTIVE");
    expect(await suspended.findUser("target")).toMatchObject({ status: "ACTIVE", deletedAt: null });
  });
});
