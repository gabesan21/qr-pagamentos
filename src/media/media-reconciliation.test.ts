import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMediaService } from "./media-service";
import type { MediaStore } from "./media-store";
import type { MediaRecord } from "./types";

const now = new Date("2026-07-23T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

function row(id: string, override: Partial<MediaRecord>): MediaRecord {
  const bytes = Buffer.from("webp");
  return {
    id,
    identifier: id.replaceAll("-", "").padEnd(43, "i").slice(0, 43),
    storageKey: id.replaceAll("-", "").padEnd(43, "s").slice(0, 43),
    ownerId: "11111111-1111-4111-8111-111111111111",
    purpose: "PRODUCT_IMAGE",
    state: "ACTIVE",
    lifecycleRevision: BigInt(0),
    mimeType: "image/webp",
    byteSize: BigInt(bytes.length),
    width: 1,
    height: 1,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    purgeAfter: null,
    createdAt: new Date(now.getTime() - day * 2),
    updatedAt: new Date(now.getTime() - day * 2),
    ...override,
  };
}

function harness(seed: readonly MediaRecord[], inventory = { untracked: [] as string[], missing: [] as string[] }) {
  const records = new Map(seed.map((record) => [record.id, record]));
  const store: MediaStore = {
    async reserve() {
      throw new Error("unused");
    },
    async transition() {
      return null;
    },
    async findByIdentifier() {
      return null;
    },
    async recheck() {
      return false;
    },
    async listAll() {
      return [...records.values()];
    },
    async listReconciliationCandidates(cutoff, timestamp) {
      return [...records.values()].filter((record) =>
        (record.state === "WRITING" && record.createdAt <= cutoff)
        || (record.state === "ORPHANED" && !!record.purgeAfter && record.purgeAfter <= timestamp)
        || record.state === "DELETING");
    },
    async claimDeleting(candidate, timestamp) {
      const current = records.get(candidate.id);
      if (!current || current.lifecycleRevision !== candidate.lifecycleRevision || current.state !== candidate.state) return null;
      const claimed = {
        ...current,
        state: "DELETING" as const,
        lifecycleRevision: current.lifecycleRevision + BigInt(1),
        purgeAfter: current.purgeAfter ?? timestamp,
      };
      records.set(candidate.id, claimed);
      return claimed;
    },
    async deleteClaim(claim) {
      const current = records.get(claim.id);
      if (!current || current.state !== "DELETING" || current.lifecycleRevision !== claim.lifecycleRevision) return false;
      records.delete(claim.id);
      return true;
    },
  };
  const storage = {
    publish: vi.fn(),
    read: vi.fn(),
    remove: vi.fn(async () => undefined),
    inventory: vi.fn(async () => inventory),
  };
  return { records, service: createMediaService(store, storage, () => now), storage };
}

describe("media reconciliation", () => {
  it("reclaims only stale writing, due orphan, and retryable deleting records", async () => {
    const staleWriting = row("10000000-0000-4000-8000-000000000001", { state: "WRITING" });
    const freshWriting = row("10000000-0000-4000-8000-000000000002", {
      state: "WRITING",
      createdAt: new Date(now.getTime() - day + 1),
    });
    const dueOrphan = row("10000000-0000-4000-8000-000000000003", {
      state: "ORPHANED",
      purgeAfter: new Date(now.getTime() - 1),
    });
    const graceOrphan = row("10000000-0000-4000-8000-000000000004", {
      state: "ORPHANED",
      purgeAfter: new Date(now.getTime() + 1),
    });
    const deleting = row("10000000-0000-4000-8000-000000000005", {
      state: "DELETING",
      purgeAfter: new Date(now.getTime() - day),
    });
    const active = row("10000000-0000-4000-8000-000000000006", {});
    const { records, service, storage } = harness([staleWriting, freshWriting, dueOrphan, graceOrphan, deleting, active]);

    expect(await service.reconcile()).toEqual({ reclaimed: 3, blocked: false });
    expect([...records.keys()]).toEqual([freshWriting.id, graceOrphan.id, active.id]);
    expect(storage.remove).toHaveBeenCalledTimes(3);
    expect(await service.reconcile()).toEqual({ reclaimed: 0, blocked: false });
  });

  it("keeps a failed durable delete in DELETING and counted for retry", async () => {
    const orphan = row("20000000-0000-4000-8000-000000000001", {
      state: "ORPHANED",
      purgeAfter: new Date(now.getTime() - 1),
    });
    const { records, service, storage } = harness([orphan]);
    storage.remove.mockRejectedValueOnce(new Error("directory sync failed"));
    expect(await service.reconcile()).toEqual({ reclaimed: 0, blocked: false });
    expect(records.get(orphan.id)?.state).toBe("DELETING");
  });

  it("reports untracked or missing inventory as admission-blocking while preserving active rows", async () => {
    const active = row("30000000-0000-4000-8000-000000000001", {});
    const { records, service, storage } = harness(
      [active],
      { untracked: ["objects/unknown.webp"], missing: [active.storageKey] },
    );
    expect(await service.reconcile()).toEqual({ reclaimed: 0, blocked: true });
    expect(records.get(active.id)).toEqual(active);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
