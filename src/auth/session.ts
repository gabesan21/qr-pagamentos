import { createHash, randomBytes } from "node:crypto";

import { getDatabaseClient } from "../db/client";

import { normalizeUsername } from "./identity";
import { verifyPassword } from "./password";

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const SESSION_LIMIT = 5;

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

function digest(token: string) { return createHash("sha256").update(token).digest("hex"); }
function expired(session: StoredSession, now: Date) {
  return now.getTime() - session.lastSeenAt.getTime() >= SESSION_IDLE_MS || now >= session.absoluteExpiresAt;
}

export function createSessionService(store: SessionStore, clock: () => Date = () => new Date()) {
  return {
    async signIn(usernameInput: string, password: string) {
      let username: string;
      try { username = normalizeUsername(usernameInput); } catch { return null; }
      const credential = await store.findCredential(username);
      if (!credential || credential.status !== "ACTIVE" || !(await verifyPassword(password, credential.passwordHash))) return null;
      return this.create(credential.id);
    },

    async create(userId: string) {
      const now = clock();
      const token = randomBytes(32).toString("base64url");
      await store.withUserLock(userId, async (lockedStore) => {
        await lockedStore.removeExpiredForUser(userId, now);
        const active = await lockedStore.activeSessions(userId);
        for (const session of active.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)).slice(0, Math.max(0, active.length - SESSION_LIMIT + 1))) {
          await lockedStore.deleteSession(session.id);
        }
        await lockedStore.createSession({ userId, tokenDigest: digest(token), createdAt: now, lastSeenAt: now, absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS) });
      });
      return token;
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
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
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
