import { createHash, randomBytes } from "node:crypto";

import { getDatabaseClient } from "../db/client";

import { normalizeUsername } from "./identity";
import { verifyPassword } from "./password";

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const SESSION_LIMIT = 5;
export const UNKNOWN_CREDENTIAL_RECORD = "scrypt$v=1$N=131072,r=8,p=1$AAECAwQFBgcICQoLDA0ODw$GylG2nH0EXnoO5ncM4QtFXQbh8QSHIx_N4HB34ZPtYs";

type StoredSession = { id: string; userId: string; tokenDigest: string; createdAt: Date; lastSeenAt: Date; absoluteExpiresAt: Date };
type Credential = { id: string; status: string; passwordHash: string };

export interface SessionStore {
  findCredential(username: string): Promise<Credential | null>;
  findSession(tokenDigest: string): Promise<StoredSession | null>;
  createSession(session: Omit<StoredSession, "id">): Promise<void>;
  deleteSession(id: string): Promise<void>;
  deleteByDigest(tokenDigest: string): Promise<void>;
  touchSession(id: string, lastSeenAt: Date): Promise<void>;
  withUserLock<T>(userId: string, work: (store: SessionStore) => Promise<T>): Promise<T>;
  removeExpiredForUser(userId: string, now: Date): Promise<void>;
  activeSessions(userId: string): Promise<StoredSession[]>;
}

interface UserSessionLockTransaction {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

export async function acquireUserSessionLock(transaction: UserSessionLockTransaction, userId: string) {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
}

function digest(token: string) { return createHash("sha256").update(token).digest("hex"); }
function expired(session: StoredSession, now: Date) {
  return now.getTime() - session.lastSeenAt.getTime() >= SESSION_IDLE_MS || now >= session.absoluteExpiresAt;
}

export function createSessionService(
  store: SessionStore,
  clock: () => Date = () => new Date(),
  verifyCredential: (plaintext: string, record: string) => Promise<boolean> = verifyPassword,
) {
  async function createLocked(lockedStore: SessionStore, userId: string) {
    const now = clock();
    const token = randomBytes(32).toString("base64url");
    await lockedStore.removeExpiredForUser(userId, now);
    const active = await lockedStore.activeSessions(userId);
    for (const session of active.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)).slice(0, Math.max(0, active.length - SESSION_LIMIT + 1))) {
      await lockedStore.deleteSession(session.id);
    }
    await lockedStore.createSession({ userId, tokenDigest: digest(token), createdAt: now, lastSeenAt: now, absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS) });
    return token;
  }

  return {
    async signIn(usernameInput: string, password: string) {
      let username: string | null = null;
      try { username = normalizeUsername(usernameInput); } catch { /* Preserve the generic credential path. */ }
      const candidate: Credential | null = username ? await store.findCredential(username) : null;
      if (!candidate) {
        await verifyCredential(password, UNKNOWN_CREDENTIAL_RECORD);
        return null;
      }
      return store.withUserLock(candidate.id, async (lockedStore) => {
        const credential = username ? await lockedStore.findCredential(username) : null;
        const passwordMatches = await verifyCredential(password, credential?.passwordHash ?? UNKNOWN_CREDENTIAL_RECORD);
        if (!credential || credential.id !== candidate.id || credential.status !== "ACTIVE" || !passwordMatches) return null;
        return createLocked(lockedStore, credential.id);
      });
    },

    async create(userId: string) {
      return store.withUserLock(userId, (lockedStore) => createLocked(lockedStore, userId));
    },

    async validate(token: string | undefined) {
      if (!token) return null;
      const session = await store.findSession(digest(token));
      if (!session) return null;
      const now = clock();
      if (expired(session, now)) {
        await store.deleteSession(session.id);
        return null;
      }
      await store.touchSession(session.id, now);
      return { userId: session.userId };
    },

    async logout(token: string | undefined) {
      if (token) await store.deleteByDigest(digest(token));
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;

function prismaStore(): SessionStore {
  const db = getDatabaseClient();
  const scoped = (client: typeof db): SessionStore => ({
    async findCredential(username) {
      const user = await client.user.findUnique({ where: { username }, include: { credential: true } });
      return user?.credential ? { id: user.id, status: user.status, passwordHash: user.credential.passwordHash } : null;
    },
    findSession: (tokenDigest) => client.session.findUnique({ where: { tokenDigest } }),
    async createSession(session) { await client.session.create({ data: session }); },
    async deleteSession(id) { await client.session.deleteMany({ where: { id } }); },
    async deleteByDigest(tokenDigest) { await client.session.deleteMany({ where: { tokenDigest } }); },
    async touchSession(id, lastSeenAt) { await client.session.updateMany({ where: { id }, data: { lastSeenAt } }); },
    async withUserLock(userId, work) {
      return client.$transaction(async (transaction) => {
        await acquireUserSessionLock(transaction, userId);
        return work(scoped(transaction as typeof db));
      });
    },
    async removeExpiredForUser(userId, now) {
      await client.session.deleteMany({ where: { userId, OR: [{ absoluteExpiresAt: { lte: now } }, { lastSeenAt: { lte: new Date(now.getTime() - SESSION_IDLE_MS) } }] } });
    },
    activeSessions: (userId) => client.session.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  });
  return scoped(db);
}

export function getSessionService() { return createSessionService(prismaStore()); }
