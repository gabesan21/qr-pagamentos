import { getSessionService, type SessionService } from "./session";
import { toUserDto, type UserRole, type UserStatus } from "./identity";
import { getDatabaseClient } from "../db/client";

export type Principal = ReturnType<typeof toUserDto>;

type StoredUser = Principal;

export interface AuthorizationStore {
  findUser(id: string): Promise<StoredUser | null>;
}

export class UnauthenticatedError extends Error {}
export class ForbiddenError extends Error {}

export function requireUserPrincipal(principal: Principal): Principal {
  if (principal.role !== "USER" || principal.status !== "ACTIVE") {
    throw new ForbiddenError("Merchant access is required");
  }
  return principal;
}

export function createAuthorizationService(session: Pick<SessionService, "validate">, store: AuthorizationStore) {
  return {
    async resolve(token: string | undefined): Promise<Principal | null> {
      const sessionIdentity = await session.validate(token);
      if (!sessionIdentity) return null;
      const user = await store.findUser(sessionIdentity.userId);
      if (!user || user.status !== "ACTIVE") return null;
      return toUserDto(user);
    },
    async requireAuthenticated(token: string | undefined): Promise<Principal> {
      const principal = await this.resolve(token);
      if (!principal) throw new UnauthenticatedError("Authentication is required");
      return principal;
    },
    async requireAdmin(token: string | undefined): Promise<Principal> {
      const principal = await this.requireAuthenticated(token);
      if (principal.role !== "ADMIN") throw new ForbiddenError("Administrator access is required");
      return principal;
    },
    async requireUser(token: string | undefined): Promise<Principal> {
      return requireUserPrincipal(await this.requireAuthenticated(token));
    },
  };
}

function prismaStore(): AuthorizationStore {
  const db = getDatabaseClient();
  return {
    async findUser(id) {
      const user = await db.user.findUnique({
        where: { id },
        select: { id: true, username: true, email: true, role: true, status: true, createdAt: true },
      });
      return user as StoredUser | null;
    },
  };
}

export function getAuthorizationService() {
  return createAuthorizationService(getSessionService(), prismaStore());
}

export type { UserRole, UserStatus };
