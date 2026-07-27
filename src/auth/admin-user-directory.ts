import "server-only";

import { requireAdminFromCookie } from "../app/admin/guard";
import { ForbiddenError, type Principal } from "../auth/authorization";
import {
  canonicalizeDirectoryRequest,
} from "../data-directory/server/canonical-request";
import {
  createDirectoryCursorCodec,
  type DirectoryCursorCodec,
  type DirectoryCursorEnvelope,
} from "../data-directory/server/cursor";
import {
  queryAdministratorDirectory,
  type DirectoryAdapter,
  type DirectoryOrderField,
  type DirectoryReadInput,
} from "../data-directory/server/directory-page";
import type {
  DirectoryFilterDefinition,
  DirectoryPageSize,
  DirectoryPageSizePolicy,
} from "../data-directory/server/query-contract";
import { getDatabaseClient } from "../db/client";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { AdminUserDtoSource } from "./identity";

// Administrator-global user directory (10.3.2): the bounded query contract of
// src/data-directory/server over every user row, read-only. Rows carry exactly
// the sanctioned administrator DTO plus two derived facts (render state and
// store state) and the last-activity aggregate — never password hashes,
// session identifiers/digests/counts, credential or provider data, profile
// version, locale, checkout policy, audit rows, or raw storefront fields
// beyond the derived state (the slug appears only on the detail). The
// mutation service stays byte-frozen; no mutation exists on this surface.
// 10.3.3 extends the bounded detail read — and only it — with the additive
// editor projection (profile version, locale, checkout policy, and the nine
// administrator-editable storefront fields): still never password hashes,
// sessions, credential/provider data, audit rows, or the owner-fenced logo
// media identifier.

export const ADMIN_USER_DIRECTORY_ID = "admin-users";
export const ADMIN_USER_DIRECTORY_PATH = "/admin/accounts";
export const ADMIN_USER_DIRECTORY_ORDER_ID = "created-at-id-desc";

export const ADMIN_USER_DIRECTORY_PAGE_SIZE_POLICY = {
  sizes: [10, 20, 50, 100],
  defaultSize: 50,
} as const satisfies DirectoryPageSizePolicy;

export const ADMIN_USER_DIRECTORY_FILTERS = [
  { name: "role", kind: "enum", values: ["ADMIN", "USER"] },
  { name: "state", kind: "enum", values: ["ACTIVE", "DISABLED", "DELETED"] },
  { name: "from", kind: "text" },
  { name: "to", kind: "text" },
] as const satisfies readonly DirectoryFilterDefinition[];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// The derived render state, computed at read time and never stored: the
// terminal deletion marker outranks the disabled status.
export type AdminUserDirectoryState = "active" | "disabled" | "deleted";

export function deriveAdminUserDirectoryState(facts: Readonly<{ status: string; deletedAt: Date | null }>): AdminUserDirectoryState {
  if (facts.deletedAt !== null) return "deleted";
  return facts.status === "ACTIVE" ? "active" : "disabled";
}

// The derived store fact: a configured slug with the storefront disabled is
// distinct from a live store and from never having configured one.
export type AdminUserStoreState = "active" | "configured" | "none";

export function deriveAdminUserStoreState(facts: Readonly<{ storefrontSlug: string | null; storefrontEnabled: boolean }>): AdminUserStoreState {
  if (facts.storefrontSlug === null) return "none";
  return facts.storefrontEnabled ? "active" : "configured";
}

export type AdminUserSummary = AdminUserDtoSource & Readonly<{
  state: AdminUserDirectoryState;
  storeState: AdminUserStoreState;
  lastActivityAt: Date | null;
}>;

// The 10.3.3 additive editor projection: the current values the profile
// editor form renders, drawn from the bounded detail read only. It never
// carries password hashes, session data, credential/provider data, audit
// rows, or the owner-fenced logo media identifier.
export type AdminUserEditorProjection = Readonly<{
  profileVersion: number;
  preferredLocale: string | null;
  checkoutDataPolicy: string;
  storefrontEnabled: boolean;
  storefrontDisplayNamePtBr: string | null;
  storefrontDisplayNameEn: string | null;
  storefrontAccentColor: string | null;
  storefrontThemeId: string | null;
  storefrontLayout: string | null;
  storefrontStandalonePaymentsEnabled: boolean;
  storefrontDefaultCurrencyCode: string | null;
}>;

// The detail adds the storefront slug and the editor projection to the row
// facts; it is the read the 10.3.3 profile editor consumes on the same route.
export type AdminUserDetail = AdminUserSummary & Readonly<{
  storefrontSlug: string | null;
  editor: AdminUserEditorProjection;
}>;

const directoryOrder = [
  { id: "createdAt", direction: "desc", value: (row: AdminUserSummary) => row.createdAt.getTime() },
  { id: "id", direction: "desc", value: (row: AdminUserSummary) => row.id, keyRole: "UNIQUE_IMMUTABLE_ID" },
] as const satisfies readonly DirectoryOrderField<AdminUserSummary>[];

function isValidSeekTuple(tuple: DirectoryCursorEnvelope["tuple"]) {
  return (
    tuple.length === directoryOrder.length
    && typeof tuple[0] === "number"
    && Number.isSafeInteger(tuple[0])
    && tuple[0] > 0
    && typeof tuple[1] === "string"
    && UUID_PATTERN.test(tuple[1])
  );
}

function calendarDayStartUtc(value: string): Date | null {
  const match = CALENDAR_DAY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, month - 1, day));
  if (
    start.getUTCFullYear() !== year
    || start.getUTCMonth() !== month - 1
    || start.getUTCDate() !== day
  ) return null;
  return start;
}

function textFilter(filters: DirectoryReadInput<AdminUserSummary>["filters"], name: string) {
  const value = filters[name];
  return typeof value === "string" ? value : undefined;
}

// Date filters are validated before any adapter I/O; an ungrammatical or
// nonexistent calendar day is the zero-I/O invalid-query outcome.
function validDateFilters(filters: DirectoryReadInput<AdminUserSummary>["filters"]) {
  const from = textFilter(filters, "from");
  const to = textFilter(filters, "to");
  if (from !== undefined && calendarDayStartUtc(from) === null) return false;
  if (to !== undefined && calendarDayStartUtc(to) === null) return false;
  return true;
}

function requireAdministrator(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

export type AdminUserDirectoryRead = Readonly<{
  where: Prisma.UserWhereInput;
  ascending: boolean;
  take: number;
}>;

export type AdminUserDirectoryStore = Readonly<{
  readWindow(input: AdminUserDirectoryRead): Promise<AdminUserSummary[]>;
  readDetail(userId: string): Promise<AdminUserDetail | null>;
}>;

function keysetSeek(
  seek: DirectoryCursorEnvelope["tuple"],
  direction: "forward" | "backward",
): Prisma.UserWhereInput {
  const createdAt = new Date(seek[0] as number);
  const id = seek[1] as string;
  const before = direction === "forward";
  return {
    OR: [
      { createdAt: before ? { lt: createdAt } : { gt: createdAt } },
      { createdAt: { equals: createdAt }, id: before ? { lt: id } : { gt: id } },
    ],
  };
}

async function readWindow(
  store: AdminUserDirectoryStore,
  input: DirectoryReadInput<AdminUserSummary>,
): Promise<readonly AdminUserSummary[]> {
  if (input.scope.purpose !== "ADMIN_GLOBAL") {
    throw new Error("The administrator user directory reads only an administrator-global scope");
  }
  const and: Prisma.UserWhereInput[] = [];

  const role = input.filters.role;
  if (Array.isArray(role) && role.length === 1) and.push({ role: role[0] });

  // The derived-state filter maps to the persisted facts it is computed from.
  const state = input.filters.state;
  if (Array.isArray(state) && state.length === 1) {
    if (state[0] === "ACTIVE") and.push({ status: "ACTIVE", deletedAt: null });
    else if (state[0] === "DISABLED") and.push({ status: "DISABLED", deletedAt: null });
    else and.push({ deletedAt: { not: null } });
  }

  const from = textFilter(input.filters, "from");
  const to = textFilter(input.filters, "to");
  const createdBounds: Prisma.DateTimeFilter = {};
  if (from !== undefined) createdBounds.gte = calendarDayStartUtc(from) as Date;
  if (to !== undefined) {
    const toStart = calendarDayStartUtc(to) as Date;
    createdBounds.lt = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
  }
  if (createdBounds.gte !== undefined || createdBounds.lt !== undefined) {
    and.push({ createdAt: createdBounds });
  }

  // The search covers only the two sanctioned administrator DTO text fields.
  const search = input.filters.q;
  if (typeof search === "string") {
    and.push({
      OR: [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (input.seek) and.push(keysetSeek(input.seek, input.direction));

  const where: Prisma.UserWhereInput = and.length > 0 ? { AND: and } : {};
  return store.readWindow({ where, ascending: input.direction === "backward", take: input.limit });
}

export type AdminUserDirectoryResult =
  | Readonly<{
      status: "ready";
      rows: readonly AdminUserSummary[];
      pageSize: DirectoryPageSize;
      nextCursor?: string;
      previousCursor?: string;
    }>
  | Readonly<{ status: "redirect"; location: string }>
  | Readonly<{ status: "invalid-query" }>;

export function createAdminUserDirectoryService(dependencies: Readonly<{
  store: AdminUserDirectoryStore;
  codec?: DirectoryCursorCodec;
}>) {
  const codec = dependencies.codec ?? createDirectoryCursorCodec();
  const adapter: DirectoryAdapter<AdminUserSummary> = {
    readWindow: (input) => readWindow(dependencies.store, input),
  };
  return {
    async query(
      principal: Principal,
      requestTarget: string,
      path: string = ADMIN_USER_DIRECTORY_PATH,
    ): Promise<AdminUserDirectoryResult> {
      const canonical = canonicalizeDirectoryRequest({
        requestTarget,
        path,
        definitions: ADMIN_USER_DIRECTORY_FILTERS,
        directory: ADMIN_USER_DIRECTORY_ID,
        scopePurpose: "ADMIN_GLOBAL",
        principal,
        orderId: ADMIN_USER_DIRECTORY_ORDER_ID,
        validateTuple: isValidSeekTuple,
        pageSizePolicy: ADMIN_USER_DIRECTORY_PAGE_SIZE_POLICY,
      }, codec);
      if (canonical.status !== "ready") return canonical;
      if (!validDateFilters(canonical.query.filters)) return { status: "invalid-query" };

      const page = await queryAdministratorDirectory({
        principal,
        directory: ADMIN_USER_DIRECTORY_ID,
        orderId: ADMIN_USER_DIRECTORY_ORDER_ID,
        order: directoryOrder,
        filters: {
          ...canonical.query.filters,
          ...(canonical.query.q ? { q: canonical.query.q } : {}),
        },
        canonicalFilterQuery: canonical.query.canonicalFilterQuery,
        pageSize: canonical.query.pageSize,
        ...(canonical.cursor ? { cursor: canonical.cursor } : {}),
        adapter,
      }, codec);
      return {
        status: "ready",
        rows: page.rows,
        pageSize: canonical.query.pageSize,
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        ...(page.previousCursor ? { previousCursor: page.previousCursor } : {}),
      };
    },
    // The bounded global detail read behind `/admin/accounts/[id]`: every
    // cross, malformed, or missing identity shares the one null outcome.
    async getAdminUserDetail(principal: Principal, userId: unknown): Promise<AdminUserDetail | null> {
      requireAdministrator(principal);
      if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) return null;
      return dependencies.store.readDetail(userId.toLowerCase());
    },
  };
}

function createPrismaAdminUserDirectoryStore(prisma: PrismaClient): AdminUserDirectoryStore {
  // One bounded last-activity fact per row: the newest session sighting, never
  // a session identifier, digest, or count.
  const rowSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    status: true,
    deletedAt: true,
    createdAt: true,
    storefrontSlug: true,
    storefrontEnabled: true,
    sessions: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
  } as const;
  type SelectedRow = Prisma.UserGetPayload<{ select: typeof rowSelect }>;
  function toSummary(row: SelectedRow): AdminUserSummary {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as AdminUserSummary["role"],
      status: row.status as AdminUserSummary["status"],
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
      state: deriveAdminUserDirectoryState(row),
      storeState: deriveAdminUserStoreState(row),
      lastActivityAt: row.sessions[0]?.lastSeenAt ?? null,
    };
  }
  return {
    async readWindow({ where, ascending, take }) {
      const direction = ascending ? "asc" : "desc";
      const rows = await prisma.user.findMany({
        where,
        orderBy: [{ createdAt: direction }, { id: direction }],
        take,
        select: rowSelect,
      });
      return rows.map(toSummary);
    },
    async readDetail(userId) {
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          ...rowSelect,
          profileVersion: true,
          preferredLocale: true,
          checkoutDataPolicy: true,
          storefrontDisplayNamePtBr: true,
          storefrontDisplayNameEn: true,
          storefrontAccentColor: true,
          storefrontThemeId: true,
          storefrontLayout: true,
          storefrontStandalonePaymentsEnabled: true,
          storefrontDefaultCurrencyCode: true,
        },
      });
      return row
        ? {
          ...toSummary(row),
          storefrontSlug: row.storefrontSlug,
          editor: {
            profileVersion: row.profileVersion,
            preferredLocale: row.preferredLocale,
            checkoutDataPolicy: row.checkoutDataPolicy,
            storefrontEnabled: row.storefrontEnabled,
            storefrontDisplayNamePtBr: row.storefrontDisplayNamePtBr,
            storefrontDisplayNameEn: row.storefrontDisplayNameEn,
            storefrontAccentColor: row.storefrontAccentColor,
            storefrontThemeId: row.storefrontThemeId,
            storefrontLayout: row.storefrontLayout,
            storefrontStandalonePaymentsEnabled: row.storefrontStandalonePaymentsEnabled,
            storefrontDefaultCurrencyCode: row.storefrontDefaultCurrencyCode,
          },
        }
        : null;
    },
  };
}

export function getAdminUserDirectoryService() {
  return createAdminUserDirectoryService({ store: createPrismaAdminUserDirectoryStore(getDatabaseClient()) });
}

// Single server entry for the administrator directory: cookie principal first,
// then canonicalization, then the bounded administrator-global read.
export async function queryAdminUserDirectory(
  requestTarget: string,
  path: string = ADMIN_USER_DIRECTORY_PATH,
): Promise<AdminUserDirectoryResult> {
  const principal = await requireAdminFromCookie();
  return getAdminUserDirectoryService().query(principal, requestTarget, path);
}
