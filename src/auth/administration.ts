import { randomUUID } from "node:crypto";

import { getDatabaseClient } from "../db/client";
import { normalizeOptionalEmail, normalizeUsername, toAdminUserDto, USER_ROLES, type UserRole, type UserStatus } from "./identity";
import { hashPassword } from "./password";
import { ForbiddenError, type Principal } from "./authorization";
import { acquireUserSessionLock } from "./session";

type UserRecord = Principal & { deletedAt: Date | null };
type MutationStore = {
  listUsers(): Promise<UserRecord[]>;
  findUser(id: string): Promise<UserRecord | null>;
  countActiveAdmins(): Promise<number>;
  updateStatus(id: string, status: UserStatus): Promise<void>;
  updateRole(id: string, role: UserRole): Promise<void>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  markDeleted(id: string, deletedAt: Date): Promise<void>;
  disableStorefront(id: string): Promise<void>;
  deactivatePaymentLinks(ownerId: string): Promise<void>;
  deactivatePaymentLinksV2(ownerId: string): Promise<void>;
  recordDeletion(deletion: { id: string; userId: string; actorId: string; createdAt: Date }): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
  createUser(input: { username: string; email: string | null; role: UserRole; passwordHash: string }): Promise<UserRecord>;
};

export interface AdministrationStore extends MutationStore {
  withAuthorizationLock<T>(work: (store: MutationStore) => Promise<T>): Promise<T>;
  withUserLock<T>(userId: string, work: (store: MutationStore) => Promise<T>): Promise<T>;
}

export class FinalAdministratorError extends Error {}
export class AdministrationValidationError extends Error {}
export class AdministrationTargetNotFoundError extends Error {}

function requireAdmin(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

export function createAdministrationService(store: AdministrationStore) {
  // Soft deletion is terminal: a marked target is indistinguishable from an
  // unknown one for every later administrative mutation.
  function requireMutableTarget(target: UserRecord) {
    if (target.deletedAt !== null) throw new AdministrationTargetNotFoundError("Administrative target was not found");
  }

  async function mutateAdminSafety(targetId: string, change: (locked: MutationStore, target: UserRecord) => Promise<void>) {
    await store.withAuthorizationLock(async (locked) => {
      const target = await locked.findUser(targetId);
      if (!target) throw new AdministrationTargetNotFoundError("Administrative target was not found");
      requireMutableTarget(target);
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
      return (await store.listUsers()).map(toAdminUserDto);
    },
    async createUser(actor: Principal, input: { username: string; email?: string | null; password: string; role: string }) {
      requireAdmin(actor);
      if (!USER_ROLES.includes(input.role as UserRole)) throw new AdministrationValidationError("Invalid role");
      try {
        const username = normalizeUsername(input.username);
        const email = normalizeOptionalEmail(input.email);
        const passwordHash = await hashPassword(input.password);
        return toAdminUserDto(await store.createUser({ username, email, role: input.role as UserRole, passwordHash }));
      } catch (error) {
        if (error instanceof AdministrationValidationError) throw error;
        throw new AdministrationValidationError("Invalid account details");
      }
    },
    async changePassword(actor: Principal, targetId: string, password: string) {
      requireAdmin(actor);
      const passwordHash = await hashPassword(password);
      await store.withUserLock(targetId, async (locked) => {
        const target = await locked.findUser(targetId);
        if (!target) throw new AdministrationTargetNotFoundError("Administrative target was not found");
        requireMutableTarget(target);
        await locked.updatePassword(targetId, passwordHash);
        await locked.revokeSessions(targetId);
      });
    },
    async changeStatus(actor: Principal, targetId: string, status: UserStatus) {
      requireAdmin(actor);
      if (status !== "ACTIVE" && status !== "DISABLED") throw new AdministrationValidationError("Invalid status");
      if (status === "DISABLED") return mutateAdminSafety(targetId, (locked) => locked.updateStatus(targetId, status));
      await store.withAuthorizationLock(async (locked) => {
        const target = await locked.findUser(targetId);
        if (!target) throw new AdministrationTargetNotFoundError("Administrative target was not found");
        requireMutableTarget(target);
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
        requireMutableTarget(target);
        if (role !== "ADMIN" && target.role === "ADMIN" && target.status === "ACTIVE" && await locked.countActiveAdmins() <= 1) {
          throw new FinalAdministratorError("The final active administrator cannot be changed");
        }
        await locked.updateRole(targetId, role);
        await locked.revokeSessions(targetId);
      });
    },
    async deleteUser(actor: Principal, targetId: string) {
      requireAdmin(actor);
      // One transaction under the authorization advisory lock: terminal marker,
      // public-surface withdrawal, audit row, then session revocation.
      await mutateAdminSafety(targetId, async (locked, target) => {
        const deletedAt = new Date();
        await locked.markDeleted(target.id, deletedAt);
        await locked.disableStorefront(target.id);
        await locked.deactivatePaymentLinks(target.id);
        await locked.deactivatePaymentLinksV2(target.id);
        await locked.recordDeletion({ id: randomUUID(), userId: target.id, actorId: actor.id, createdAt: deletedAt });
      });
    },
  };
}

function prismaStore(): AdministrationStore {
  const db = getDatabaseClient();
  const userSelect = { id: true, username: true, email: true, role: true, status: true, deletedAt: true, createdAt: true } as const;
  const scoped = (client: typeof db): MutationStore => ({
    async listUsers() { return (await client.user.findMany({ select: userSelect })) as UserRecord[]; },
    async findUser(id) { return (await client.user.findUnique({ where: { id }, select: userSelect })) as UserRecord | null; },
    countActiveAdmins: () => client.user.count({ where: { role: "ADMIN", status: "ACTIVE" } }),
    async updateStatus(id, status) { await client.user.update({ where: { id }, data: { status } }); },
    async updateRole(id, role) { await client.user.update({ where: { id }, data: { role } }); },
    async updatePassword(id, passwordHash) { await client.passwordCredential.update({ where: { userId: id }, data: { passwordHash } }); },
    async markDeleted(id, deletedAt) { await client.user.update({ where: { id }, data: { deletedAt, status: "DISABLED" } }); },
    async disableStorefront(id) { await client.user.update({ where: { id }, data: { storefrontEnabled: false } }); },
    async deactivatePaymentLinks(ownerId) { await client.paymentLink.updateMany({ where: { ownerId }, data: { active: false } }); },
    async deactivatePaymentLinksV2(ownerId) { await client.paymentLinkV2.updateMany({ where: { ownerId }, data: { active: false } }); },
    async recordDeletion(deletion) { await client.userDeletion.create({ data: deletion }); },
    async revokeSessions(userId) { await client.session.deleteMany({ where: { userId } }); },
    async createUser(input) {
      return (await client.user.create({
        data: { username: input.username, email: input.email, role: input.role, status: "ACTIVE", credential: { create: { passwordHash: input.passwordHash } } },
        select: userSelect,
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
    async withUserLock(userId, work) {
      return db.$transaction(async (transaction) => {
        await acquireUserSessionLock(transaction, userId);
        return work(scoped(transaction as typeof db));
      });
    },
  };
}

export function getAdministrationService() { return createAdministrationService(prismaStore()); }
