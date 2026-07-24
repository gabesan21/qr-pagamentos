import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import type { Principal } from "../auth/authorization";
import { getDatabaseClient } from "../db/client";
import { canonicalizeMedia } from "./media-validation";
import { createConfiguredMediaStorage, type PosixMediaStorage } from "./media-storage";
import { createPrismaMediaStore, type MediaStore } from "./media-store";
import {
  MEDIA_GRACE_MS,
  MEDIA_IDENTIFIER_PATTERN,
  MEDIA_PURPOSES,
  type MediaPurpose,
  type MediaRead,
  type MediaRecord,
  type MediaState,
} from "./types";

export class MediaUnavailableError extends Error {}

function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function requireOwner(actor: Principal): string {
  if (actor.role !== "USER" || actor.status !== "ACTIVE") throw new MediaUnavailableError("Media is unavailable");
  return actor.id;
}

function requirePurpose(value: unknown): MediaPurpose {
  if (typeof value !== "string" || !MEDIA_PURPOSES.includes(value as MediaPurpose)) {
    throw new MediaUnavailableError("Media is unavailable");
  }
  return value as MediaPurpose;
}

function requireIdentity(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new MediaUnavailableError("Media is unavailable");
  }
  return value.toLowerCase();
}

function requireRevision(value: unknown): bigint {
  if (typeof value === "bigint" && value >= BigInt(0)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw new MediaUnavailableError("Media is unavailable");
}

function inventoryIsComplete(inventory: { untracked: readonly string[]; missing: readonly string[] }): boolean {
  return inventory.untracked.length === 0 && inventory.missing.length === 0;
}

export function createMediaService(
  store: MediaStore,
  storage: Pick<PosixMediaStorage, "publish" | "read" | "remove" | "inventory">,
  now: () => Date = () => new Date(),
) {
  async function descriptorRead(record: MediaRecord): Promise<MediaRead | null> {
    try {
      const bytes = await storage.read(record);
      if (!(await store.recheck(record.identifier, record.lifecycleRevision, record.state, record.ownerId))) return null;
      return { bytes, identifier: record.identifier, revision: record.lifecycleRevision };
    } catch {
      return null;
    }
  }

  async function lifecycle(
    actor: Principal,
    id: unknown,
    purpose: unknown,
    revision: unknown,
    from: readonly MediaState[],
    to: MediaState,
    purgeAfter: Date | null,
  ): Promise<MediaRecord> {
    const changed = await store.transition(
      requireOwner(actor),
      requirePurpose(purpose),
      requireIdentity(id),
      requireRevision(revision),
      from,
      to,
      purgeAfter,
    );
    if (!changed) throw new MediaUnavailableError("Media is unavailable");
    return changed;
  }

  return {
    async create(actor: Principal, purpose: unknown, input: Uint8Array): Promise<MediaRecord> {
      const ownerId = requireOwner(actor);
      const acceptedPurpose = requirePurpose(purpose);
      const canonical = await canonicalizeMedia(input);
      const timestamp = now();
      const reservation = await store.reserve({
        id: randomUUID(),
        identifier: opaqueToken(),
        storageKey: opaqueToken(),
        ownerId,
        purpose: acceptedPurpose,
        mimeType: canonical.mimeType,
        byteSize: BigInt(canonical.byteSize),
        width: canonical.width,
        height: canonical.height,
        sha256: canonical.sha256,
        createdAt: timestamp,
        updatedAt: timestamp,
      }, async (records) => inventoryIsComplete(await storage.inventory(records)));
      try {
        await storage.publish(reservation, canonical.bytes);
      } catch {
        throw new MediaUnavailableError("Media is unavailable");
      }
      const staged = await store.transition(
        ownerId,
        acceptedPurpose,
        reservation.id,
        reservation.lifecycleRevision,
        ["WRITING"],
        "STAGED",
        null,
      );
      if (!staged) throw new MediaUnavailableError("Media is unavailable");
      return staged;
    },
    activate(actor: Principal, id: unknown, purpose: unknown, revision: unknown) {
      return lifecycle(actor, id, purpose, revision, ["STAGED", "ORPHANED"], "ACTIVE", null);
    },
    orphan(actor: Principal, id: unknown, purpose: unknown, revision: unknown) {
      return lifecycle(
        actor,
        id,
        purpose,
        revision,
        ["STAGED", "ACTIVE"],
        "ORPHANED",
        new Date(now().getTime() + MEDIA_GRACE_MS),
      );
    },
    async readPublic(identifier: unknown): Promise<MediaRead | null> {
      if (typeof identifier !== "string" || !MEDIA_IDENTIFIER_PATTERN.test(identifier)) return null;
      const record = await store.findByIdentifier(identifier);
      if (!record || record.state !== "ACTIVE") return null;
      return descriptorRead(record);
    },
    async readForOwner(actor: Principal, identifier: unknown): Promise<MediaRead | null> {
      let ownerId: string;
      try {
        ownerId = requireOwner(actor);
      } catch {
        return null;
      }
      if (typeof identifier !== "string" || !MEDIA_IDENTIFIER_PATTERN.test(identifier)) return null;
      const record = await store.findByIdentifier(identifier);
      if (!record || record.ownerId !== ownerId) return null;
      if (record.state === "ORPHANED" && (!record.purgeAfter || record.purgeAfter <= now())) return null;
      if (!["ACTIVE", "STAGED", "ORPHANED"].includes(record.state)) return null;
      return descriptorRead(record);
    },
    async reconcile(): Promise<{ reclaimed: number; blocked: boolean }> {
      const current = await store.listAll();
      await storage.inventory(current);
      let reclaimed = 0;
      const timestamp = now();
      const cutoff = new Date(timestamp.getTime() - MEDIA_GRACE_MS);
      for (const candidate of await store.listReconciliationCandidates(cutoff, timestamp)) {
        const claim = await store.claimDeleting(candidate, timestamp);
        if (!claim) continue;
        try {
          await storage.remove(claim);
          if (await store.deleteClaim(claim)) reclaimed += 1;
        } catch {
          // DELETING remains counted and is retryable through the next fenced claim.
        }
      }
      const finalInventory = await storage.inventory(await store.listAll());
      return {
        reclaimed,
        blocked: !inventoryIsComplete(finalInventory),
      };
    },
  };
}

let service: ReturnType<typeof createMediaService> | undefined;

export function getMediaService() {
  service ??= createMediaService(
    createPrismaMediaStore(getDatabaseClient()),
    createConfiguredMediaStorage(),
  );
  return service;
}
