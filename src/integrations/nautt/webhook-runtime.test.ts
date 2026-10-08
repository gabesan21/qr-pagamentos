import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as NauttCrypto from "../../lib/nautt-crypto";

vi.mock("server-only", () => ({}));
const fixtures = vi.hoisted(() => ({
  findUnique: vi.fn(), credentialRead: vi.fn(), claim: vi.fn(), bindOrder: vi.fn(), finalize: vi.fn(),
  reconcileWebhookOrder: vi.fn(), repairWebhookSettlement: vi.fn(),
  loadEncryptionKey: vi.fn(), loadPreviousEncryptionKey: vi.fn(), logWebhookRejection: vi.fn(),
}));
vi.mock("../../db/client", () => ({ getDatabaseClient: () => ({
  providerOrder: { findUnique: fixtures.findUnique }, nauttCredential: { findUnique: fixtures.credentialRead },
}) }));
vi.mock("./owner-pricing-orders", () => ({ getOwnerPricingOrdersService: () => ({
  reconcileWebhookOrder: fixtures.reconcileWebhookOrder, repairWebhookSettlement: fixtures.repairWebhookSettlement,
}) }));
vi.mock("./webhook-delivery-store", () => ({ createPrismaWebhookDeliveryStore: () => ({ claim: fixtures.claim, bindOrder: fixtures.bindOrder, finalize: fixtures.finalize }) }));
vi.mock("../../observability/webhook-rejection-log", () => ({ logWebhookRejection: fixtures.logWebhookRejection }));
vi.mock("../../lib/nautt-crypto", async (importOriginal) => ({
  ...await importOriginal<typeof NauttCrypto>(),
  loadEncryptionKey: fixtures.loadEncryptionKey, loadPreviousEncryptionKey: fixtures.loadPreviousEncryptionKey,
}));
import { handleNauttWebhook } from "./webhook-runtime";
import { createPrismaProviderOrderOwnerResolver } from "./provider-order-store";
import { encrypt } from "../../lib/nautt-crypto";
import type { PrismaClient } from "../../generated/prisma/client";

const ownerId = "550e8400-e29b-41d4-a716-446655440010";
const orderUuid = "550e8400-e29b-41d4-a716-446655440012";
const secret = "nautt_whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const rawBody = Buffer.from(JSON.stringify({
  id: "550e8400-e29b-41d4-a716-446655440011", event: "order.paid", created_at: "2026-07-17T20:00:00Z", data: { uuid: orderUuid },
}));
const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
let currentKey: Buffer;
let previousKey: Buffer;

beforeEach(() => {
  vi.resetAllMocks();
  currentKey = Buffer.alloc(32, 1);
  previousKey = Buffer.alloc(32, 2);
  fixtures.findUnique.mockResolvedValue({ ownerId });
  fixtures.credentialRead.mockResolvedValue({ webhookRegistrationState: "ACTIVE", encryptedWebhookSecret: encrypt(secret, currentKey) });
  fixtures.loadEncryptionKey.mockReturnValue(currentKey);
  fixtures.loadPreviousEncryptionKey.mockReturnValue(undefined);
  fixtures.claim.mockResolvedValue({ kind: "claimed", attemptNumber: 1 });
  fixtures.reconcileWebhookOrder.mockResolvedValue({ kind: "processed", localOrderId: "local-order" });
  fixtures.repairWebhookSettlement.mockResolvedValue({ kind: "processed", localOrderId: "local-order" });
});

function expectNoEffects() {
  expect(fixtures.claim).not.toHaveBeenCalled();
  expect(fixtures.bindOrder).not.toHaveBeenCalled();
  expect(fixtures.finalize).not.toHaveBeenCalled();
  expect(fixtures.reconcileWebhookOrder).not.toHaveBeenCalled();
  expect(fixtures.repairWebhookSettlement).not.toHaveBeenCalled();
}

describe("webhook runtime owner-bound signing secret", () => {
  it("resolves unknown UUIDs without secret or encryption-key access", async () => {
    fixtures.findUnique.mockResolvedValue(null);
    await expect(handleNauttWebhook({ rawBody, signature: null })).resolves.toEqual({ status: 204 });
    expect(fixtures.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { providerOrderUuid: orderUuid }, select: { ownerId: true } });
    expect(fixtures.credentialRead).not.toHaveBeenCalled();
    expect(fixtures.loadEncryptionKey).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it.each([null, "", "sha256=bad"])("rejects missing/malformed signature without credential lookup: %s", async (value) => {
    await expect(handleNauttWebhook({ rawBody, signature: value })).resolves.toEqual({ status: 401 });
    expect(fixtures.credentialRead).not.toHaveBeenCalled();
    expect(fixtures.loadEncryptionKey).not.toHaveBeenCalled();
    expect(fixtures.logWebhookRejection).toHaveBeenCalledOnce();
    expectNoEffects();
  });

  it("loads fresh owner keys for every authenticated duplicate without caching", async () => {
    const keys: Buffer[] = [];
    fixtures.loadEncryptionKey.mockImplementation(() => {
      const key = Buffer.alloc(32, 1);
      keys.push(key);
      return key;
    });
    fixtures.claim.mockResolvedValueOnce({ kind: "claimed", attemptNumber: 1 }).mockResolvedValueOnce({ kind: "terminal" });
    await expect(handleNauttWebhook({ rawBody, signature })).resolves.toEqual({ status: 204 });
    await expect(handleNauttWebhook({ rawBody, signature })).resolves.toEqual({ status: 204 });
    expect(fixtures.credentialRead).toHaveBeenCalledTimes(2);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    for (const key of keys) expect(key).toEqual(Buffer.alloc(32));
    expect(fixtures.reconcileWebhookOrder).toHaveBeenCalledOnce();
    expect(fixtures.repairWebhookSettlement).toHaveBeenCalledOnce();
  });

  it.each(["current", "previous"])("authenticates full textual secret encrypted with %s key and clears keys", async (source) => {
    fixtures.credentialRead.mockResolvedValue({ webhookRegistrationState: "ACTIVE", encryptedWebhookSecret: encrypt(secret, source === "current" ? currentKey : previousKey) });
    fixtures.loadPreviousEncryptionKey.mockReturnValue(previousKey);
    await expect(handleNauttWebhook({ rawBody, signature })).resolves.toEqual({ status: 204 });
    expect(fixtures.credentialRead).toHaveBeenCalledExactlyOnceWith({ where: { userId: ownerId }, select: { webhookRegistrationState: true, encryptedWebhookSecret: true } });
    expect(fixtures.reconcileWebhookOrder).toHaveBeenCalledExactlyOnceWith(ownerId, orderUuid);
    expect(currentKey).toEqual(Buffer.alloc(32));
    expect(previousKey).toEqual(Buffer.alloc(32));
    expect(fixtures.logWebhookRejection).not.toHaveBeenCalled();
  });

  it.each([null, ...["UNREGISTERED", "REGISTERING", "INDETERMINATE"].map((webhookRegistrationState) => ({ webhookRegistrationState, encryptedWebhookSecret: "unused" })), { webhookRegistrationState: "ACTIVE", encryptedWebhookSecret: null }])("rejects unusable credentials without key access: %j", async (row) => {
    fixtures.credentialRead.mockResolvedValue(row);
    await expect(handleNauttWebhook({ rawBody, signature })).resolves.toEqual({ status: 401 });
    expect(fixtures.loadEncryptionKey).not.toHaveBeenCalled();
    expect(fixtures.loadPreviousEncryptionKey).not.toHaveBeenCalled();
    expect(fixtures.logWebhookRejection).toHaveBeenCalledExactlyOnceWith("unmatched", "550e8400-e29b-41d4-a716-446655440011", "order.paid");
    expectNoEffects();
  });

  it.each(["empty-ciphertext", "empty-plaintext", "corrupt", "database", "missing-current", "malformed-current", "malformed-previous"])("returns operational 503 without auth logging: %s", async (fault) => {
    if (fault === "database") fixtures.credentialRead.mockRejectedValue(new Error("private DB detail"));
    if (fault === "empty-ciphertext" || fault === "empty-plaintext" || fault === "corrupt") fixtures.credentialRead.mockResolvedValue({ webhookRegistrationState: "ACTIVE", encryptedWebhookSecret: fault === "empty-ciphertext" ? "" : fault === "empty-plaintext" ? encrypt("", currentKey) : "corrupted" });
    if (fault === "missing-current") fixtures.loadEncryptionKey.mockImplementation(() => { throw new Error("missing key"); });
    if (fault === "malformed-current") fixtures.loadEncryptionKey.mockReturnValue(currentKey = Buffer.alloc(3, 1));
    if (fault === "malformed-previous") fixtures.loadPreviousEncryptionKey.mockImplementation(() => { throw new Error("malformed previous key"); });
    await expect(handleNauttWebhook({ rawBody, signature })).resolves.toEqual({ status: 503 });
    expect(fixtures.logWebhookRejection).not.toHaveBeenCalled();
    expectNoEffects();
    if (fixtures.loadEncryptionKey.mock.results[0]?.type === "return") expect(currentKey).toEqual(Buffer.alloc(currentKey.length));
    if (fault === "empty-ciphertext") expect(fixtures.loadEncryptionKey).not.toHaveBeenCalled();
  });

  it("does not use a different owner's secret or fall back after mismatch", async () => {
    fixtures.credentialRead.mockResolvedValue({ webhookRegistrationState: "ACTIVE", encryptedWebhookSecret: encrypt("another-owner-secret", currentKey) });
    await expect(handleNauttWebhook({ rawBody, signature })).resolves.toEqual({ status: 401 });
    expect(fixtures.credentialRead).toHaveBeenCalledOnce();
    expectNoEffects();
    expect(currentKey).toEqual(Buffer.alloc(32));
  });

  it("preserves nonempty legacy secret bytes without trimming or format validation", async () => {
    const legacySecret = " legacy-key ação ";
    fixtures.credentialRead.mockResolvedValue({ webhookRegistrationState: "ACTIVE", encryptedWebhookSecret: encrypt(legacySecret, currentKey) });
    const legacySignature = `sha256=${createHmac("sha256", legacySecret).update(rawBody).digest("hex")}`;
    await expect(handleNauttWebhook({ rawBody, signature: legacySignature })).resolves.toEqual({ status: 204 });
  });
});

describe("persisted provider order owner resolver", () => {
  it.each(["owner-a", "owner-b"])("returns persisted %s from a global UUID lookup without credentials", async (ownerId) => {
    const findUnique = vi.fn().mockResolvedValue({ ownerId });
    const credentialRead = vi.fn(() => { throw new Error("credential access is forbidden"); });
    const prisma = { providerOrder: { findUnique }, nauttCredential: { findUnique: credentialRead } } as unknown as PrismaClient;
    await expect(createPrismaProviderOrderOwnerResolver(prisma)(orderUuid)).resolves.toBe(ownerId);
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({ where: { providerOrderUuid: orderUuid }, select: { ownerId: true } });
    expect(credentialRead).not.toHaveBeenCalled();
  });

  it("propagates database failure rather than treating unavailable ownership as unknown", async () => {
    const findUnique = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const prisma = { providerOrder: { findUnique } } as unknown as PrismaClient;
    await expect(createPrismaProviderOrderOwnerResolver(prisma)(orderUuid)).rejects.toThrow("database unavailable");
  });
});
