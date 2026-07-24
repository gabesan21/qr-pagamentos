import { describe, expect, it } from "vitest";

import { createAuthorizationService, ForbiddenError, UnauthenticatedError } from "./authorization";

const createdAt = new Date("2026-07-16T00:00:00Z");
const admin = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt };
const user = { ...admin, id: "user", username: "user", role: "USER" as const };

describe("server authorization", () => {
  it("denies stale and unprivileged principals", async () => {
    const identities = new Map<string, string | null>([["live-admin", "admin"], ["live-user", "user"], ["expired", null], ["revoked", null], ["deleted", "missing"], ["disabled", "disabled"]]);
    const service = createAuthorizationService(
      { validate: async (token) => token ? identities.get(token) ? { userId: identities.get(token)! } : null : null },
      { findUser: async (id) => id === "admin" ? admin : id === "user" ? user : id === "disabled" ? { ...user, id, status: "DISABLED" } : null },
    );
    for (const token of [undefined, "invalid", "expired", "revoked", "deleted", "disabled"]) {
      await expect(service.requireAuthenticated(token)).rejects.toBeInstanceOf(UnauthenticatedError);
    }
    await expect(service.requireAdmin("live-user")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.requireAdmin("live-admin")).resolves.toEqual(admin);
    await expect(service.requireUser("live-admin")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.requireUser("live-user")).resolves.toEqual(user);
  });
});
