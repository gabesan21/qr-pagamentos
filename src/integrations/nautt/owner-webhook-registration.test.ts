import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { NauttCredentialRecord, NauttWebhookRegistrationState } from "../../auth/nautt-credential";
import { createClientWebhooksAdapter, NAUTT_WEBHOOK_EVENT_TYPES } from "./client-webhooks";
import {
  createOwnerWebhookRegistrationService,
  OwnerWebhookRegistrationError,
  OwnerWebhookRegistrationRecoveryRequiredError,
  type OwnerWebhookRegistrationStore,
} from "./owner-webhook-registration";

const ownerId = "owner-id";
const callbackUrl = "https://payments.example.com/api/nautt/webhooks";
const providerWebhookId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const registeredAt = new Date("2026-07-17T20:00:00Z");
const plaintextApiKey = "owner-api-key";
const plaintextSecret = "nautt_whsec_one-time-secret";
const encryptionKey = Buffer.alloc(32, 0x31);

function record(state: NauttWebhookRegistrationState = "UNREGISTERED"): NauttCredentialRecord {
  return {
    userId: ownerId,
    encryptedApiKey: "encrypted-api-key",
    credentialRevision: "revision-a",
    webhookRegistrationState: state,
    providerWebhookId: state === "ACTIVE" ? providerWebhookId : null,
    encryptedWebhookSecret: state === "ACTIVE" ? "encrypted-webhook-secret" : null,
    webhookRegisteredAt: state === "ACTIVE" ? registeredAt : null,
    createdAt: new Date("2026-07-17T18:00:00Z"),
    updatedAt: new Date("2026-07-17T19:00:00Z"),
  };
}

function store(initial: NauttCredentialRecord | null = record()): OwnerWebhookRegistrationStore & {
  current: NauttCredentialRecord | null;
  failClaim?: boolean;
  loseClaim?: boolean;
  failActivate?: boolean;
} {
  return {
    current: initial,
    async findMetadata() {
      if (!this.current) return null;
      const { credentialRevision, webhookRegistrationState, providerWebhookId, encryptedWebhookSecret, webhookRegisteredAt } = this.current;
      return structuredClone({ credentialRevision, webhookRegistrationState, providerWebhookId, encryptedWebhookSecret, webhookRegisteredAt });
    },
    async claimAndReadEncryptedApiKey(_userId, expectedRevision) {
      if (this.failClaim) throw new Error("claim outcome unknown");
      if (this.loseClaim || !this.current || this.current.webhookRegistrationState !== "UNREGISTERED" || this.current.credentialRevision !== expectedRevision) return null;
      this.current.webhookRegistrationState = "REGISTERING";
      this.current.updatedAt = new Date(this.current.updatedAt.getTime() + 1);
      return this.current.encryptedApiKey;
    },
    async markIndeterminate() {
      if (this.current?.webhookRegistrationState === "REGISTERING") this.current.webhookRegistrationState = "INDETERMINATE";
    },
    async activate(_userId, registration) {
      if (this.failActivate || this.current?.webhookRegistrationState !== "REGISTERING") return false;
      Object.assign(this.current, {
        webhookRegistrationState: "ACTIVE",
        providerWebhookId: registration.providerWebhookId,
        encryptedWebhookSecret: registration.encryptedWebhookSecret,
        webhookRegisteredAt: registration.registeredAt,
      });
      return true;
    },
  };
}

function crypto(overrides: Partial<{ decrypt: () => string; encrypt: () => string }> = {}) {
  return {
    decrypt: vi.fn(overrides.decrypt ?? (() => plaintextApiKey)),
    encrypt: vi.fn(overrides.encrypt ?? (() => "encrypted-webhook-secret")),
    loadKey: vi.fn(() => encryptionKey),
  };
}

function providerSuccess(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        uuid: providerWebhookId,
        url: callbackUrl,
        secret: plaintextSecret,
        event_types: [...NAUTT_WEBHOOK_EVENT_TYPES],
        is_active: true,
        created_at: registeredAt.toISOString(),
        ...overrides,
      },
    }),
    { status: 201 },
  );
}

describe("owner webhook registration", () => {
  it.each([
    ["missing credential", null, callbackUrl, undefined],
    ["invalid callback", record(), "http://payments.example.com/webhook", undefined],
    ["callback credentials", record(), "https://user:pass@payments.example.com/webhook", undefined],
    ["callback fragment", record(), "https://payments.example.com/webhook#fragment", undefined],
  ])("keeps pre-claim failure definitive with zero provider calls: %s", async (_label, initial, url, decrypt) => {
    const repository = store(initial);
    const before = structuredClone(repository.current);
    const fetch = vi.fn();
    const service = createOwnerWebhookRegistrationService(repository, createClientWebhooksAdapter({ fetch }), crypto(decrypt ? { decrypt } : {}));
    await expect(service.register(ownerId, url)).rejects.toBeInstanceOf(OwnerWebhookRegistrationError);
    expect(repository.current).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("claims the exact revision before decrypting and preserves a failed decrypt as recovery-required", async () => {
    const repository = store();
    const fetch = vi.fn();
    const cryptography = crypto({ decrypt: () => { throw new Error(`cannot decrypt ${plaintextApiKey}`); } });
    const service = createOwnerWebhookRegistrationService(repository, createClientWebhooksAdapter({ fetch }), cryptography);
    await expect(service.register(ownerId, callbackUrl, "revision-a")).rejects.toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    expect(repository.current?.webhookRegistrationState).toBe("INDETERMINATE");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["race", "uncertain"])("does not dispatch after an atomic claim %s", async (kind) => {
    const repository = store();
    if (kind === "race") repository.loseClaim = true;
    else repository.failClaim = true;
    const fetch = vi.fn();
    const service = createOwnerWebhookRegistrationService(repository, createClientWebhooksAdapter({ fetch }), crypto());
    await expect(service.register(ownerId, callbackUrl)).rejects.toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a stale UUID without reading or decrypting the replacement even when updatedAt is identical", async () => {
    const repository = store();
    const sharedTimestamp = repository.current!.updatedAt;
    Object.assign(repository.current!, {
      encryptedApiKey: "encrypted-key-b",
      credentialRevision: "revision-b",
      updatedAt: sharedTimestamp,
    });
    const fetch = vi.fn(async () => providerSuccess());
    const cryptography = crypto();
    const service = createOwnerWebhookRegistrationService(repository, createClientWebhooksAdapter({ fetch }), cryptography);

    await expect(service.register(ownerId, callbackUrl, "revision-a")).rejects.toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    expect(cryptography.decrypt).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    await expect(service.register(ownerId, callbackUrl, "revision-b")).resolves.toEqual({ providerWebhookId, state: "ACTIVE", registeredAt });
    expect(cryptography.decrypt).toHaveBeenCalledWith("encrypted-key-b", encryptionKey);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("persists encrypted success and returns only redacted metadata", async () => {
    const repository = store();
    const fetch = vi.fn(async () => providerSuccess());
    const cryptography = crypto();
    const service = createOwnerWebhookRegistrationService(repository, createClientWebhooksAdapter({ fetch }), cryptography);
    const result = await service.register(ownerId, callbackUrl);

    expect(result).toEqual({ providerWebhookId, state: "ACTIVE", registeredAt });
    expect(JSON.stringify(result)).not.toContain(plaintextApiKey);
    expect(JSON.stringify(result)).not.toContain(plaintextSecret);
    expect(repository.current?.encryptedWebhookSecret).toBe("encrypted-webhook-secret");
    expect(cryptography.encrypt).toHaveBeenCalledWith(plaintextSecret, encryptionKey);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns an existing ACTIVE registration without decrypting or dispatching", async () => {
    const repository = store(record("ACTIVE"));
    const fetch = vi.fn();
    const cryptography = crypto();
    const result = await createOwnerWebhookRegistrationService(repository, createClientWebhooksAdapter({ fetch }), cryptography).register(ownerId, callbackUrl);
    expect(result).toEqual({ providerWebhookId, state: "ACTIVE", registeredAt });
    expect(cryptography.decrypt).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["REGISTERING", "INDETERMINATE"] as const)("refuses prior %s without dispatch", async (state) => {
    const repository = store(record(state));
    const fetch = vi.fn();
    const service = createOwnerWebhookRegistrationService(repository, createClientWebhooksAdapter({ fetch }), crypto());
    await expect(service.register(ownerId, callbackUrl)).rejects.toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 422, 429, 500, 599])("makes HTTP %s indeterminate and blocks a second POST", async (status) => {
    const repository = store();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ apiKey: plaintextApiKey }), { status }));
    const service = createOwnerWebhookRegistrationService(repository, createClientWebhooksAdapter({ fetch }), crypto());
    await expect(service.register(ownerId, callbackUrl)).rejects.toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    await expect(service.register(ownerId, callbackUrl)).rejects.toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    expect(repository.current?.webhookRegistrationState).toBe("INDETERMINATE");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["malformed body", () => new Response("not-json", { status: 201 })],
    ["missing tuple", () => providerSuccess({ secret: "" })],
    ["inactive", () => providerSuccess({ is_active: false })],
    ["mismatched callback", () => providerSuccess({ url: "https://other.example.com/webhook" })],
    ["mismatched events", () => providerSuccess({ event_types: NAUTT_WEBHOOK_EVENT_TYPES.slice(1) })],
    ["transport", () => Promise.reject(new Error(`transport ${plaintextApiKey}`))],
    ["timeout", () => Promise.reject(new DOMException("timeout", "TimeoutError"))],
    ["abort", () => Promise.reject(new DOMException("abort", "AbortError"))],
  ])("makes %s indeterminate and blocks a second POST", async (_label, outcome) => {
    const repository = store();
    const fetch = vi.fn(async () => outcome());
    const service = createOwnerWebhookRegistrationService(repository, createClientWebhooksAdapter({ fetch }), crypto());
    const error = await service.register(ownerId, callbackUrl).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    expect(JSON.stringify(error)).not.toContain(plaintextApiKey);
    expect(JSON.stringify(error)).not.toContain(plaintextSecret);
    await expect(service.register(ownerId, callbackUrl)).rejects.toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    expect(repository.current?.webhookRegistrationState).toBe("INDETERMINATE");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("makes post-response encryption failure indeterminate and blocks retry", async () => {
    const repository = store();
    const fetch = vi.fn(async () => providerSuccess());
    const service = createOwnerWebhookRegistrationService(
      repository,
      createClientWebhooksAdapter({ fetch }),
      crypto({ encrypt: () => { throw new Error(`encrypt ${plaintextSecret}`); } }),
    );
    await expect(service.register(ownerId, callbackUrl)).rejects.toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    await expect(service.register(ownerId, callbackUrl)).rejects.toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    expect(repository.current?.webhookRegistrationState).toBe("INDETERMINATE");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("makes success persistence failure indeterminate and blocks retry", async () => {
    const repository = store();
    repository.failActivate = true;
    const fetch = vi.fn(async () => providerSuccess());
    const service = createOwnerWebhookRegistrationService(repository, createClientWebhooksAdapter({ fetch }), crypto());
    await expect(service.register(ownerId, callbackUrl)).rejects.toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    await expect(service.register(ownerId, callbackUrl)).rejects.toBeInstanceOf(OwnerWebhookRegistrationRecoveryRequiredError);
    expect(repository.current?.webhookRegistrationState).toBe("INDETERMINATE");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
