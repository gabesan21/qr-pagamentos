import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "../../auth/authorization";
import { NauttCredentialReplacementBlockedError } from "../../auth/nautt-credential";
import { OwnerWebhookRegistrationError, OwnerWebhookRegistrationRecoveryRequiredError } from "./owner-webhook-registration";
import {
  createOwnerOnboardingService,
  OwnerOnboardingChangedError,
  OwnerOnboardingInvalidKeyError,
  OwnerOnboardingRecoveryRequiredError,
} from "./owner-onboarding";

const actor = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const admin = { ...actor, id: "admin", role: "ADMIN" as const };
const balance = { tokenSymbol: "USDT", tokenName: "Tether USD", networkName: "Polygon", balance: "9.25" };

function ports() {
  return {
    credentials: {
      snapshotRevision: vi.fn(async () => "revision-a" as string | null),
      saveValidated: vi.fn(async () => "revision-b"),
      getRedacted: vi.fn(async () => ({ hasCredential: true, credentialRevision: "revision-b", webhookRegistrationState: "ACTIVE" as const, updatedAt: new Date() })),
      getDecryptedApiKey: vi.fn(async () => "validated-key"),
    },
    wallet: { read: vi.fn(async () => balance) },
    registration: { register: vi.fn(async () => ({})), reset: vi.fn(async () => true) },
  };
}

describe("owner onboarding", () => {
  it("denies administrators before credential, decryption, provider, or registration work", async () => {
    const dependency = ports();
    const service = createOwnerOnboardingService(dependency.credentials, dependency.wallet, dependency.registration);

    await expect(service.onboard(admin, actor.id, "key", "https://payments.example/webhooks")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.completeRegistration(admin, "https://payments.example/webhooks")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.resetRegistration(admin)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.readStatus(admin)).rejects.toBeInstanceOf(ForbiddenError);
    expect(Object.values(dependency.credentials).every((operation) => operation.mock.calls.length === 0)).toBe(true);
    expect(dependency.wallet.read).not.toHaveBeenCalled();
    expect(dependency.registration.register).not.toHaveBeenCalled();
    expect(dependency.registration.reset).not.toHaveBeenCalled();
  });

  it("denies cross-owner onboarding before credential or provider work", async () => {
    const dependency = ports();
    const service = createOwnerOnboardingService(dependency.credentials, dependency.wallet, dependency.registration);

    await expect(service.onboard(actor, "other-owner", "key", "https://payments.example/webhooks")).rejects.toBeInstanceOf(ForbiddenError);
    expect(dependency.credentials.snapshotRevision).not.toHaveBeenCalled();
    expect(dependency.wallet.read).not.toHaveBeenCalled();
    expect(dependency.credentials.saveValidated).not.toHaveBeenCalled();
    expect(dependency.registration.register).not.toHaveBeenCalled();
  });

  it("validates before CAS persistence and registers only the committed revision", async () => {
    const dependency = ports();
    const order: string[] = [];
    dependency.wallet.read.mockImplementation(async () => { order.push("validate"); return balance; });
    dependency.credentials.saveValidated.mockImplementation(async () => { order.push("save"); return "revision-b"; });
    dependency.registration.register.mockImplementation(async () => { order.push("register"); return {}; });
    await createOwnerOnboardingService(dependency.credentials, dependency.wallet, dependency.registration)
      .onboard(actor, actor.id, "validated-key", "https://payments.example/webhooks");
    expect(order).toEqual(["validate", "save", "register"]);
    expect(dependency.credentials.saveValidated).toHaveBeenCalledWith(actor, actor.id, "validated-key", "revision-a");
    expect(dependency.registration.register).toHaveBeenCalledWith(actor.id, "https://payments.example/webhooks", "revision-b");
  });

  it("does not persist or register an invalid key", async () => {
    const dependency = ports();
    dependency.wallet.read.mockRejectedValue(new Error("provider raw body"));
    const service = createOwnerOnboardingService(dependency.credentials, dependency.wallet, dependency.registration);
    await expect(service.onboard(actor, actor.id, "bad-key", "https://payments.example/webhooks")).rejects.toBeInstanceOf(OwnerOnboardingInvalidKeyError);
    expect(dependency.credentials.saveValidated).not.toHaveBeenCalled();
    expect(dependency.registration.register).not.toHaveBeenCalled();
  });

  it("maps a stale CAS and exact-claim loss to opaque non-retry results", async () => {
    const dependency = ports();
    dependency.credentials.saveValidated.mockRejectedValueOnce(new NauttCredentialReplacementBlockedError());
    let service = createOwnerOnboardingService(dependency.credentials, dependency.wallet, dependency.registration);
    await expect(service.onboard(actor, actor.id, "key-a", "https://payments.example/webhooks")).rejects.toBeInstanceOf(OwnerOnboardingChangedError);
    expect(dependency.registration.register).not.toHaveBeenCalled();

    dependency.credentials.saveValidated.mockResolvedValueOnce("revision-b");
    dependency.registration.register.mockRejectedValueOnce(new OwnerWebhookRegistrationRecoveryRequiredError());
    service = createOwnerOnboardingService(dependency.credentials, dependency.wallet, dependency.registration);
    await expect(service.onboard(actor, actor.id, "key-b", "https://payments.example/webhooks")).rejects.toBeInstanceOf(OwnerOnboardingRecoveryRequiredError);
    expect(dependency.registration.register).toHaveBeenCalledTimes(1);
  });

  it("pins the validated winning key across a paused same-timestamp A/B interleaving", async () => {
    let current = { revision: "revision-original", apiKey: "original-key", updatedAt: new Date("2026-07-17T20:00:00.000Z") };
    let releaseA!: () => void;
    let signalACommitted!: () => void;
    const aCommitted = new Promise<void>((resolve) => { signalACommitted = resolve; });
    const resumeA = new Promise<void>((resolve) => { releaseA = resolve; });
    const staleTrace = { ciphertextReads: 0, decrypts: 0, dispatches: 0 };
    const winnerTrace = { ciphertextReads: 0, decrypts: 0, dispatches: 0 };
    const credentials = {
      snapshotRevision: vi.fn(async () => current.revision),
      saveValidated: vi.fn(async (_actor, _ownerId, apiKey: string, expectedRevision: string | null) => {
        if (expectedRevision !== current.revision) throw new NauttCredentialReplacementBlockedError();
        const freshRevision = apiKey === "key-a" ? "revision-a" : "revision-b";
        current = { revision: freshRevision, apiKey, updatedAt: current.updatedAt };
        if (apiKey === "key-a") { signalACommitted(); await resumeA; }
        return freshRevision;
      }),
      getRedacted: vi.fn(async () => ({ hasCredential: true, credentialRevision: current.revision, webhookRegistrationState: "ACTIVE" as const, updatedAt: current.updatedAt })),
      getDecryptedApiKey: vi.fn(async () => current.apiKey),
    };
    const wallet = { read: vi.fn(async (apiKey: string) => ({ ...balance, tokenName: apiKey })) };
    const registration = { register: vi.fn(async (_ownerId: string, _callback: string, expectedRevision: string) => {
      const trace = expectedRevision === "revision-a" ? staleTrace : winnerTrace;
      if (expectedRevision !== current.revision) throw new OwnerWebhookRegistrationRecoveryRequiredError();
      trace.ciphertextReads += 1; trace.decrypts += 1; trace.dispatches += 1;
    }), reset: vi.fn(async () => false) };
    const service = createOwnerOnboardingService(credentials, wallet, registration);

    const requestA = service.onboard(actor, actor.id, "key-a", "https://payments.example/webhooks");
    await aCommitted;
    await service.onboard(actor, actor.id, "key-b", "https://payments.example/webhooks");
    releaseA();
    await expect(requestA).rejects.toBeInstanceOf(OwnerOnboardingRecoveryRequiredError);
    const status = await service.readStatus(actor);

    expect(current).toEqual({ revision: "revision-b", apiKey: "key-b", updatedAt: new Date("2026-07-17T20:00:00.000Z") });
    expect(staleTrace).toEqual({ ciphertextReads: 0, decrypts: 0, dispatches: 0 });
    expect(winnerTrace).toEqual({ ciphertextReads: 1, decrypts: 1, dispatches: 1 });
    expect(status.balance?.tokenName).toBe("key-b");
  });

  it("resets only the actor's own registration", async () => {
    const dependency = ports();
    const service = createOwnerOnboardingService(dependency.credentials, dependency.wallet, dependency.registration);
    await service.resetRegistration(actor);
    expect(dependency.registration.reset).toHaveBeenCalledWith(actor.id);
  });

  it("maps a refused reset to an opaque changed outcome", async () => {
    const dependency = ports();
    dependency.registration.reset.mockResolvedValue(false);
    const service = createOwnerOnboardingService(dependency.credentials, dependency.wallet, dependency.registration);
    await expect(service.resetRegistration(actor)).rejects.toBeInstanceOf(OwnerOnboardingChangedError);
  });

  it("propagates an uncertain reset outcome without wrapping it", async () => {
    const dependency = ports();
    const failure = new OwnerWebhookRegistrationError("reset outcome unknown");
    dependency.registration.reset.mockRejectedValue(failure);
    const service = createOwnerOnboardingService(dependency.credentials, dependency.wallet, dependency.registration);
    await expect(service.resetRegistration(actor)).rejects.toBe(failure);
  });
});
