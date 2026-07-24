import { getDatabaseClient } from "../db/client";
import { requireUserPrincipal, type Principal } from "./authorization";
import { normalizeOptionalEmail, normalizeUsername, validatePassword } from "./identity";
import { hashPassword, verifyPassword } from "./password";
import { acquireUserSessionLock, UNKNOWN_CREDENTIAL_RECORD } from "./session";

export type MerchantProfile = Readonly<{
  username: string;
  email: string | null;
  version: number;
}>;

type ProfileCredential = Readonly<{
  passwordHash: string;
}>;

export type ProfileStore = Readonly<{
  get(userId: string): Promise<MerchantProfile | null>;
  updateIdentity(
    userId: string,
    expectedVersion: number,
    values: Pick<MerchantProfile, "username" | "email">,
  ): Promise<"changed" | "conflict" | "unavailable">;
  withUserLock<T>(userId: string, work: (store: LockedProfileStore) => Promise<T>): Promise<T>;
}>;

export type LockedProfileStore = Readonly<{
  getCredential(userId: string): Promise<ProfileCredential | null>;
  replaceCredentialAndRevokeSessions(
    userId: string,
    expectedPasswordHash: string,
    passwordHash: string,
  ): Promise<boolean>;
}>;

type PasswordVerifier = (
  plaintext: string,
  record: string,
  onBeforeScrypt?: () => void,
) => Promise<boolean>;

export class ProfileValidationError extends Error {}
export class ProfileConflictError extends Error {}
export class ProfileUnavailableError extends Error {}
export class ProfilePasswordError extends Error {}

const VERSION_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const MAX_DATABASE_INTEGER = 2_147_483_647;
const DUMMY_PASSWORD = "profile dummy password";

function parseVersion(value: unknown): number {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new ProfileValidationError("Profile version is invalid");
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version > MAX_DATABASE_INTEGER) {
    throw new ProfileValidationError("Profile version is invalid");
  }
  return version;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string") throw new ProfileValidationError("Profile input is invalid");
  return value;
}

async function verifyExactlyOnce(
  plaintext: string,
  record: string | null,
  verifier: PasswordVerifier,
  onBeforeScrypt: () => void,
) {
  let workCount = 0;
  const countWork = () => {
    workCount += 1;
    onBeforeScrypt();
  };
  let proof = false;
  if (record !== null) {
    try {
      proof = await verifier(plaintext, record, countWork);
    } catch {
      proof = false;
    }
  }
  if (workCount === 0) {
    await verifier(DUMMY_PASSWORD, UNKNOWN_CREDENTIAL_RECORD, countWork);
    return false;
  }
  return workCount === 1 && proof;
}

export function createProfileService(
  store: ProfileStore,
  verifier: PasswordVerifier = verifyPassword,
  passwordHasher: (plaintext: string) => Promise<string> = hashPassword,
) {
  return {
    async get(actor: Principal): Promise<MerchantProfile> {
      requireUserPrincipal(actor);
      const profile = await store.get(actor.id);
      if (!profile) throw new ProfileUnavailableError("Profile is unavailable");
      return profile;
    },

    async updateIdentity(
      actor: Principal,
      input: Readonly<{ username: unknown; email: unknown; expectedVersion: unknown }>,
    ) {
      requireUserPrincipal(actor);
      let username: string;
      let email: string | null;
      let expectedVersion: number;
      try {
        username = normalizeUsername(requiredString(input.username));
        email = normalizeOptionalEmail(requiredString(input.email));
        expectedVersion = parseVersion(input.expectedVersion);
      } catch {
        throw new ProfileValidationError("Profile input is invalid");
      }
      const outcome = await store.updateIdentity(actor.id, expectedVersion, { username, email });
      if (outcome === "conflict") throw new ProfileConflictError("Profile update conflicts");
      if (outcome === "unavailable") throw new ProfileUnavailableError("Profile is unavailable");
    },

    async changePassword(
      actor: Principal,
      input: Readonly<{ currentPassword: unknown; newPassword: unknown; confirmation: unknown }>,
      onBeforeScrypt: () => void = () => undefined,
    ) {
      requireUserPrincipal(actor);
      const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
      const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
      const confirmation = typeof input.confirmation === "string" ? input.confirmation : "";

      return store.withUserLock(actor.id, async (locked) => {
        const credential = await locked.getCredential(actor.id);
        const currentProof = await verifyExactlyOnce(
          currentPassword,
          credential?.passwordHash ?? null,
          verifier,
          onBeforeScrypt,
        );

        let validNewPassword = false;
        try {
          validatePassword(newPassword);
          validNewPassword = newPassword === confirmation && newPassword !== currentPassword;
        } catch {
          validNewPassword = false;
        }
        if (!credential || !currentProof || !validNewPassword) {
          throw new ProfilePasswordError("Password change is unavailable");
        }

        const replacement = await passwordHasher(newPassword);
        if (!await locked.replaceCredentialAndRevokeSessions(actor.id, credential.passwordHash, replacement)) {
          throw new ProfilePasswordError("Password change is unavailable");
        }
      });
    },
  };
}

function isIdentityUniqueCollision(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "P2002";
}

export function createDatabaseProfileStore(
  db: ReturnType<typeof getDatabaseClient>,
): ProfileStore {
  return {
    async get(userId) {
      return db.user.findFirst({
        where: { id: userId, role: "USER", status: "ACTIVE" },
        select: { username: true, email: true, profileVersion: true },
      }).then((profile) => profile
        ? { username: profile.username, email: profile.email, version: profile.profileVersion }
        : null);
    },
    async updateIdentity(userId, expectedVersion, values) {
      try {
        return await db.$transaction(async (transaction) => {
          const changed = await transaction.user.updateMany({
            where: { id: userId, role: "USER", status: "ACTIVE", profileVersion: expectedVersion },
            data: { ...values, profileVersion: { increment: 1 } },
          });
          if (changed.count === 1) return "changed";
          const available = await transaction.user.count({
            where: { id: userId, role: "USER", status: "ACTIVE" },
          });
          return available === 1 ? "conflict" : "unavailable";
        });
      } catch (error) {
        if (isIdentityUniqueCollision(error)) return "conflict";
        throw error;
      }
    },
    async withUserLock(userId, work) {
      return db.$transaction(async (transaction) => {
        await acquireUserSessionLock(transaction, userId);
        const locked: LockedProfileStore = {
          async getCredential(id) {
            const user = await transaction.user.findFirst({
              where: { id, role: "USER", status: "ACTIVE" },
              select: { credential: { select: { passwordHash: true } } },
            });
            return user?.credential ?? null;
          },
          async replaceCredentialAndRevokeSessions(id, expectedPasswordHash, passwordHash) {
            const changed = await transaction.passwordCredential.updateMany({
              where: { userId: id, passwordHash: expectedPasswordHash },
              data: { passwordHash },
            });
            if (changed.count !== 1) return false;
            await transaction.session.deleteMany({ where: { userId: id } });
            return true;
          },
        };
        return work(locked);
      });
    },
  };
}

export function getProfileService() {
  return createProfileService(createDatabaseProfileStore(getDatabaseClient()));
}
