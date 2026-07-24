import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

import type { Principal } from "../auth/authorization";
import type { PrismaClient } from "../generated/prisma/client";
import { createMediaService, MediaUnavailableError } from "./media-service";
import { createPrismaMediaStore, MediaAdmissionError, mediaQuotaAllows, type MediaStore } from "./media-store";
import type { MediaRecord } from "./types";

const owner = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "merchant",
  email: null,
  role: "USER",
  status: "ACTIVE",
  createdAt: new Date("2026-07-23T00:00:00Z"),
} satisfies Principal;
const otherOwner = { ...owner, id: "22222222-2222-4222-8222-222222222222" } satisfies Principal;
const now = new Date("2026-07-23T12:00:00Z");

function media(override: Partial<MediaRecord> = {}): MediaRecord {
  const bytes = Buffer.from("webp");
  return {
    id: "33333333-3333-4333-8333-333333333333",
    identifier: "i".repeat(43),
    storageKey: "s".repeat(43),
    ownerId: owner.id,
    purpose: "PRODUCT_IMAGE",
    state: "STAGED",
    lifecycleRevision: BigInt(0),
    mimeType: "image/webp",
    byteSize: BigInt(bytes.length),
    width: 1,
    height: 1,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    purgeAfter: null,
    createdAt: now,
    updatedAt: now,
    ...override,
  };
}

function harness(seed: MediaRecord[] = [media()]) {
  const records = new Map(seed.map((record) => [record.id, record]));
  const bodies = new Map(seed.map((record) => [record.storageKey, Buffer.from("webp")]));
  const store: MediaStore = {
    async reserve(candidate, inventory) {
      const current = [...records.values()];
      if (!(await inventory(current)) || !mediaQuotaAllows(current, candidate)) throw new MediaAdmissionError();
      const reserved = media({ ...candidate, state: "WRITING", lifecycleRevision: BigInt(0), purgeAfter: null });
      records.set(reserved.id, reserved);
      return reserved;
    },
    async transition(ownerId, purpose, id, revision, from, to, purgeAfter) {
      const current = records.get(id);
      if (!current || current.ownerId !== ownerId || current.purpose !== purpose || current.lifecycleRevision !== revision || !from.includes(current.state)) return null;
      const changed = { ...current, state: to, lifecycleRevision: revision + BigInt(1), purgeAfter, updatedAt: now };
      records.set(id, changed);
      return changed;
    },
    async findByIdentifier(identifier) {
      return [...records.values()].find((record) => record.identifier === identifier) ?? null;
    },
    async recheck(identifier, revision, state, ownerId) {
      const current = [...records.values()].find((record) => record.identifier === identifier);
      return !!current && current.lifecycleRevision === revision && current.state === state && (!ownerId || current.ownerId === ownerId);
    },
    async listAll() {
      return [...records.values()];
    },
    async listReconciliationCandidates() {
      return [];
    },
    async claimDeleting() {
      return null;
    },
    async deleteClaim() {
      return false;
    },
  };
  const storage = {
    publish: vi.fn(async (record: MediaRecord, bytes: Buffer) => {
      bodies.set(record.storageKey, Buffer.from(bytes));
    }),
    read: vi.fn(async (record: MediaRecord) => {
      const body = bodies.get(record.storageKey);
      if (!body) throw new Error("missing");
      return body;
    }),
    remove: vi.fn(),
    inventory: vi.fn(async (): Promise<{ untracked: string[]; missing: string[] }> => ({ untracked: [], missing: [] })),
  };
  return { service: createMediaService(store, storage, () => now), records, storage };
}

describe("media service", () => {
  it("fences lifecycle transitions by owner, purpose, state, and monotonic revision", async () => {
    const { service } = harness();
    await expect(service.activate(otherOwner, media().id, "PRODUCT_IMAGE", BigInt(0))).rejects.toBeInstanceOf(MediaUnavailableError);
    await expect(service.activate(owner, media().id, "STOREFRONT_LOGO", BigInt(0))).rejects.toBeInstanceOf(MediaUnavailableError);
    const active = await service.activate(owner, media().id, "PRODUCT_IMAGE", BigInt(0));
    const orphaned = await service.orphan(owner, active.id, active.purpose, active.lifecycleRevision);
    await expect(service.activate(owner, orphaned.id, orphaned.purpose, BigInt(0))).rejects.toBeInstanceOf(MediaUnavailableError);
    const reactivated = await service.activate(owner, orphaned.id, orphaned.purpose, orphaned.lifecycleRevision);
    expect(reactivated.lifecycleRevision).toBe(BigInt(3));
  });

  it("revokes public access immediately while retaining owner grace access", async () => {
    const { service } = harness();
    const active = await service.activate(owner, media().id, "PRODUCT_IMAGE", BigInt(0));
    expect(await service.readPublic(active.identifier)).not.toBeNull();
    const orphaned = await service.orphan(owner, active.id, active.purpose, active.lifecycleRevision);
    expect(await service.readPublic(orphaned.identifier)).toBeNull();
    expect(await service.readForOwner(owner, orphaned.identifier)).not.toBeNull();
    expect(await service.readForOwner(otherOwner, orphaned.identifier)).toBeNull();
  });

  it("rechecks the exact revision after the descriptor read", async () => {
    const { service, records, storage } = harness([media({ state: "ACTIVE" })]);
    storage.read.mockImplementationOnce(async (record) => {
      records.set(record.id, { ...record, state: "ORPHANED", lifecycleRevision: BigInt(1), purgeAfter: new Date(now.getTime() + 1) });
      return Buffer.from("webp");
    });
    expect(await service.readPublic(media().identifier)).toBeNull();
  });

  it("denies admission when inventory is incomplete before reserving metadata", async () => {
    const { service, storage } = harness([]);
    storage.inventory.mockResolvedValueOnce({ untracked: ["objects/unknown"], missing: [] });
    const fixture = await sharp({ create: { width: 1, height: 1, channels: 3, background: "black" } }).png().toBuffer();
    await expect(service.create(owner, "PRODUCT_IMAGE", fixture)).rejects.toBeInstanceOf(MediaAdmissionError);
    expect(storage.publish).not.toHaveBeenCalled();
  });

  it("counts every state toward physical owner and logo quotas", () => {
    const allStates = ["WRITING", "STAGED", "ACTIVE", "ORPHANED", "DELETING"] as const;
    const retained = Array.from({ length: 256 }, (_, index) => media({
      id: `${String(index).padStart(8, "0")}-3333-4333-8333-333333333333`,
      state: allStates[index % allStates.length],
      byteSize: BigInt(1),
    }));
    expect(mediaQuotaAllows(retained, {
      ...media({ id: "44444444-4444-4444-8444-444444444444" }),
      byteSize: BigInt(1),
    })).toBe(false);
    const logos = Array.from({ length: 8 }, (_, index) => media({
      id: `${String(index).padStart(8, "0")}-5555-4555-8555-555555555555`,
      purpose: "STOREFRONT_LOGO",
    }));
    expect(mediaQuotaAllows(logos, {
      ...media({ purpose: "STOREFRONT_LOGO" }),
    })).toBe(false);
  });

  it("serializes owner admission and rechecks physical inventory before reservation", async () => {
    const events: string[] = [];
    const candidate = media({
      id: "66666666-6666-4666-8666-666666666666",
      identifier: "n".repeat(43),
      storageKey: "k".repeat(43),
    });
    const transaction = {
      $queryRaw: vi.fn(async () => {
        events.push("owner-lock");
        return [{ id: owner.id }];
      }),
      mediaObject: {
        findMany: vi.fn(async () => {
          events.push("rows");
          return [];
        }),
        create: vi.fn(async ({ data }) => {
          events.push("create");
          return { ...candidate, ...data };
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback, options) => {
        expect(options).toEqual({ isolationLevel: "Serializable" });
        return callback(transaction);
      }),
    } as unknown as PrismaClient;
    const store = createPrismaMediaStore(prisma);
    await store.reserve({
      id: candidate.id,
      identifier: candidate.identifier,
      storageKey: candidate.storageKey,
      ownerId: candidate.ownerId,
      purpose: candidate.purpose,
      mimeType: candidate.mimeType,
      byteSize: candidate.byteSize,
      width: candidate.width,
      height: candidate.height,
      sha256: candidate.sha256,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    }, async () => {
      events.push("inventory");
      return true;
    });
    expect(events).toEqual(["owner-lock", "rows", "inventory", "create"]);
  });
});
