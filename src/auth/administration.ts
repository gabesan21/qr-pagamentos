import { getDatabaseClient } from "../db/client";
import { normalizeOptionalEmail, normalizeUsername, toUserDto, USER_ROLES, type UserRole, type UserStatus } from "./identity";
import { hashPassword } from "./password";
import { ForbiddenError, type Principal } from "./authorization";

type UserRecord = Principal;
type MutationStore = {
  listUsers(): Promise<UserRecord[]>;
  findUser(id: string): Promise<UserRecord | null>;
  countActiveAdmins(): Promise<number>;
  updateStatus(id: string, status: UserStatus): Promise<void>;
  updateRole(id: string, role: UserRole): Promise<void>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
  createUser(input: { username: string; email: string | null; role: UserRole; passwordHash: string }): Promise<UserRecord>;
};

export interface AdministrationStore extends MutationStore {
  withAuthorizationLock<T>(work: (store: MutationStore) => Promise<T>): Promise<T>;
}

export class FinalAdministratorError extends Error {}
export class AdministrationValidationError extends Error {}
export class AdministrationTargetNotFoundError extends Error {}

function requireAdmin(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

export function createAdministrationService(store: AdministrationStore) {
  async function mutateAdminSafety(targetId: string, change: (locked: MutationStore, target: UserRecord) => Promise<void>) {
    await store.withAuthorizationLock(async (locked) => {
      const target = await locked.findUser(targetId);
      if (!target) throw new AdministrationTargetNotFoundError("Administrative target was not found");
      const removesAdmin = target.role === "ADMIN" && target.status === "ACTIVE";
      if (removesAdmin && await locked.countActiveAdmins() <= 1) {
        throw new FinalAdministratorError("The final active administrator cannot be changed");
      }
      await change(locked, target);
      await locked.revokeSessions(targetId);
    });
  }

  return {
    async listUsers(actor: Principal) {
      requireAdmin(actor);
      return (await store.listUsers()).map(toUserDto);
    },
    async createUser(actor: Principal, input: { username: string; email?: string | null; password: string; role: string }) {
      requireAdmin(actor);
      if (!USER_ROLES.includes(input.role as UserRole)) throw new AdministrationValidationError("Invalid role");
      try {
        const username = normalizeUsername(input.username);
        const email = normalizeOptionalEmail(input.email);
        const passwordHash = await hashPassword(input.password);
        return toUserDto(await store.createUser({ username, email, role: input.role as UserRole, passwordHash }));
      } catch (error) {
        if (error instanceof AdministrationValidationError) throw error;
        throw new AdministrationValidationError("Invalid account details");
      }
    },
    async changePassword(actor: Principal, targetId: string, password: string) {
      requireAdmin(actor);
      const passwordHash = await hashPassword(password);
      await store.withAuthorizationLock(async (locked) => {
        if (!await locked.findUser(targetId)) throw new AdministrationTargetNotFoundError("Administrative target was not found");
        await locked.updatePassword(targetId, passwordHash);
        await locked.revokeSessions(targetId);
      });
    },
    async changeStatus(actor: Principal, targetId: string, status: UserStatus) {
      requireAdmin(actor);
      if (status !== "ACTIVE" && status !== "DISABLED") throw new AdministrationValidationError("Invalid status");
      if (status === "DISABLED") return mutateAdminSafety(targetId, (locked) => locked.updateStatus(targetId, status));
      await store.withAuthorizationLock(async (locked) => {
        if (!await locked.findUser(targetId)) throw new AdministrationTargetNotFoundError("Administrative target was not found");
        await locked.updateStatus(targetId, status);
        await locked.revokeSessions(targetId);
      });
    },
    async changeRole(actor: Principal, targetId: string, role: UserRole) {
      requireAdmin(actor);
      if (role !== "ADMIN" && role !== "USER") throw new AdministrationValidationError("Invalid role");
      await store.withAuthorizationLock(async (locked) => {
        const target = await locked.findUser(targetId);
        if (!target) throw new AdministrationTargetNotFoundError("Administrative target was not found");
        if (role !== "ADMIN" && target.role === "ADMIN" && target.status === "ACTIVE" && await locked.countActiveAdmins() <= 1) {
          throw new FinalAdministratorError("The final active administrator cannot be changed");
        }
        await locked.updateRole(targetId, role);
        await locked.revokeSessions(targetId);
      });
    },
  };
}

function prismaStore(): AdministrationStore {
  const db = getDatabaseClient();
  const scoped = (client: typeof db): MutationStore => ({
    async listUsers() { return (await client.user.findMany({ select: { id: true, username: true, email: true, role: true, status: true, createdAt: true } })) as UserRecord[]; },
    async findUser(id) { return (await client.user.findUnique({ where: { id }, select: { id: true, username: true, email: true, role: true, status: true, createdAt: true } })) as UserRecord | null; },
    countActiveAdmins: () => client.user.count({ where: { role: "ADMIN", status: "ACTIVE" } }),
    async updateStatus(id, status) { await client.user.update({ where: { id }, data: { status } }); },
    async updateRole(id, role) { await client.user.update({ where: { id }, data: { role } }); },
    async updatePassword(id, passwordHash) { await client.passwordCredential.update({ where: { userId: id }, data: { passwordHash } }); },
    async revokeSessions(userId) { await client.session.deleteMany({ where: { userId } }); },
    async createUser(input) {
      return (await client.user.create({
        data: { username: input.username, email: input.email, role: input.role, status: "ACTIVE", credential: { create: { passwordHash: input.passwordHash } } },
        select: { id: true, username: true, email: true, role: true, status: true, createdAt: true },
      })) as UserRecord;
    },
  });
  return {
    ...scoped(db),
    async withAuthorizationLock(work) {
      return db.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('qr:authorization:active-admin'))`;
        return work(scoped(transaction as typeof db));
      });
    },
  };
}

export function getAdministrationService() { return createAdministrationService(prismaStore()); }
