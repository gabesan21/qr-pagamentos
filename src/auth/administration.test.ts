import { describe, expect, it } from "vitest";

import { AdministrationTargetNotFoundError, createAdministrationService, FinalAdministratorError, type AdministrationStore } from "./administration";

const createdAt = new Date("2026-07-16T00:00:00Z");
type TestUser = { id: string; username: string; email: string | null; role: "ADMIN" | "USER"; status: "ACTIVE" | "DISABLED"; createdAt: Date };
const admin: TestUser = { id: "admin", username: "admin", email: null, role: "ADMIN", status: "ACTIVE", createdAt };

function storeWith(users: TestUser[] = [admin]): AdministrationStore & { sessions: string[]; lockScopes: number; validatesTargetToken(): boolean } {
  const sessions = users.map((user) => user.id);
  const data = new Map(users.map((user) => [user.id, { ...user }]));
  let lockScopes = 0;
  const mutationStore = {
    async listUsers() { return [...data.values()]; },
    async findUser(id: string) { return data.get(id) ?? null; },
    async countActiveAdmins() { return [...data.values()].filter((user) => user.role === "ADMIN" && user.status === "ACTIVE").length; },
    async updateStatus(id: string, status: "ACTIVE" | "DISABLED") { const user = data.get(id); if (user) user.status = status; },
    async updateRole(id: string, role: "ADMIN" | "USER") { const user = data.get(id); if (user) user.role = role; },
    async updatePassword() {},
    async revokeSessions(id: string) { for (let index = sessions.length - 1; index >= 0; index -= 1) if (sessions[index] === id) sessions.splice(index, 1); },
    async createUser(input: { username: string; email: string | null; role: "ADMIN" | "USER" }) {
      const user: TestUser = { id: `user-${data.size}`, username: input.username, email: input.email, role: input.role, status: "ACTIVE", createdAt };
      data.set(user.id, user);
      return user;
    },
  };
  return {
    ...mutationStore,
    sessions,
    validatesTargetToken: () => sessions.includes("target"),
    get lockScopes() { return lockScopes; },
    async withAuthorizationLock(work) { lockScopes += 1; return work(mutationStore); },
    async withUserLock(_userId, work) { lockScopes += 1; return work(mutationStore); },
  };
}

describe("identity administration", () => {
  it("revokes every affected session", async () => {
    for (const change of ["password", "role", "status"] as const) {
      const store = storeWith([admin, { ...admin, id: "target", username: "target", role: "USER" }]);
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
    await expect(service.createUser(admin, { username: " New.User ", email: " NEW@example.com ", password: "correct horse battery staple", role: "USER" })).resolves.toMatchObject({ username: "new.user", email: "new@example.com", role: "USER", status: "ACTIVE" });
    await expect(service.createUser({ ...admin, role: "USER" }, { username: "other.user", password: "correct horse battery staple", role: "USER" })).rejects.toThrow("Administrator access is required");
    await expect(service.createUser(admin, { username: "bad name", password: "short", role: "OTHER" })).rejects.toThrow("Invalid role");
  });
});
