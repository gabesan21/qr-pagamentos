import { beforeEach, describe, expect, it, vi, type Mocked } from "vitest";

vi.mock("server-only", () => ({}));

const { requestReset } = vi.hoisted(() => ({ requestReset: vi.fn() }));

vi.mock("@/auth/password-reset", () => ({
  getPasswordResetService: () => ({ requestReset }),
  PasswordResetRateLimitError: class PasswordResetRateLimitError extends Error {},
}));

import {
  AdminPasswordResetUnavailableError,
  createAdminPasswordResetService,
  PasswordResetRequestOutcome,
  type AdminPasswordResetStore,
} from "./admin-password-reset";
import { MailSenderError } from "./mail-sender";

const config = {
  host: "smtp.example.com",
  port: 587,
  user: "user@example.com",
  password: "secret",
  from: "noreply@example.com",
  tlsMode: "starttls" as const,
};

const origin = "https://app.example.com";
const actor = {
  id: "admin-id",
  username: "admin",
  email: null,
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
  createdAt: new Date(),
};

function createHarness() {
  const store: Mocked<AdminPasswordResetStore> = {
    findMerchantForReset: vi.fn(),
    recordRequest: vi.fn(),
  };
  const sender = { send: vi.fn() };
  const clock = vi.fn(() => new Date("2026-07-28T20:00:00.000Z"));
  const randomId = vi.fn(() => "audit-id");
  const service = createAdminPasswordResetService(store, {
    config,
    origin,
    sender,
    clock,
    randomId,
  });
  return { service, store, sender, clock, randomId };
}

beforeEach(() => vi.clearAllMocks());

describe("admin password reset service", () => {
  it("sends a bilingual reset message and records SENT on success", async () => {
    const { service, store, sender } = createHarness();
    store.findMerchantForReset.mockResolvedValue({ email: "owner@example.com", available: true });
    requestReset.mockResolvedValue({ token: "abc123-token" });

    await service.sendResetEmail("target-id", actor);

    expect(store.findMerchantForReset).toHaveBeenCalledWith("target-id");
    expect(requestReset).toHaveBeenCalledWith("owner@example.com");
    expect(sender.send).toHaveBeenCalledTimes(1);

    const message = sender.send.mock.calls[0][0];
    expect(message.to).toBe("owner@example.com");
    expect(message.subject).toBe("Password reset / Redefinição de senha");

    const expectedLink = "https://app.example.com/reset-password?token=abc123-token";
    expect(message.text).toContain(expectedLink);
    expect(message.html).toContain(expectedLink);
    expect(message.text).toContain("Reset your password");
    expect(message.text).toContain("Redefina sua senha");
    expect(message.html).toContain("Reset your password");
    expect(message.html).toContain("Redefina sua senha");

    expect(store.recordRequest).toHaveBeenCalledTimes(1);
    const audit = store.recordRequest.mock.calls[0][0];
    expect(audit.id).toBe("audit-id");
    expect(audit.userId).toBe("target-id");
    expect(audit.actorId).toBe(actor.id);
    expect(audit.outcome).toBe(PasswordResetRequestOutcome.SENT);
    expect(audit.createdAt).toBeInstanceOf(Date);
  });

  it("records NO_EMAIL and remains opaque when the target has no email", async () => {
    const { service, store, sender } = createHarness();
    store.findMerchantForReset.mockResolvedValue({ email: null, available: true });

    await expect(service.sendResetEmail("target-id", actor)).rejects.toBeInstanceOf(
      AdminPasswordResetUnavailableError,
    );

    expect(requestReset).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
    expect(store.recordRequest).toHaveBeenCalledTimes(1);
    const audit = store.recordRequest.mock.calls[0][0];
    expect(audit.outcome).toBe(PasswordResetRequestOutcome.NO_EMAIL);
    expect(audit.userId).toBe("target-id");
    expect(audit.actorId).toBe(actor.id);
  });

  it("records UNAVAILABLE when the target is inactive, deleted, or not a merchant", async () => {
    const { service, store, sender } = createHarness();
    store.findMerchantForReset.mockResolvedValue({ email: "owner@example.com", available: false });

    await expect(service.sendResetEmail("inactive-id", actor)).rejects.toBeInstanceOf(
      AdminPasswordResetUnavailableError,
    );

    expect(store.findMerchantForReset).toHaveBeenCalledWith("inactive-id");
    expect(requestReset).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
    expect(store.recordRequest).toHaveBeenCalledTimes(1);
    const audit = store.recordRequest.mock.calls[0][0];
    expect(audit.outcome).toBe(PasswordResetRequestOutcome.UNAVAILABLE);
  });

  it("records UNAVAILABLE when the target does not exist", async () => {
    const { service, store } = createHarness();
    store.findMerchantForReset.mockResolvedValue(null);

    await expect(service.sendResetEmail("missing-id", actor)).rejects.toBeInstanceOf(
      AdminPasswordResetUnavailableError,
    );

    expect(store.recordRequest).toHaveBeenCalledTimes(1);
    expect(store.recordRequest.mock.calls[0][0].outcome).toBe(
      PasswordResetRequestOutcome.UNAVAILABLE,
    );
  });

  it("records RATE_LIMITED and remains opaque when the reset service rate-limits", async () => {
    const { PasswordResetRateLimitError } = await import("@/auth/password-reset");
    const { service, store, sender } = createHarness();
    store.findMerchantForReset.mockResolvedValue({ email: "owner@example.com", available: true });
    requestReset.mockRejectedValue(new PasswordResetRateLimitError("too many requests"));

    await expect(service.sendResetEmail("target-id", actor)).rejects.toBeInstanceOf(
      AdminPasswordResetUnavailableError,
    );

    expect(sender.send).not.toHaveBeenCalled();
    expect(store.recordRequest).toHaveBeenCalledTimes(1);
    const audit = store.recordRequest.mock.calls[0][0];
    expect(audit.outcome).toBe(PasswordResetRequestOutcome.RATE_LIMITED);
  });

  it("records DELIVERY_FAILED and propagates MailSenderError on send failure", async () => {
    const { service, store, sender } = createHarness();
    store.findMerchantForReset.mockResolvedValue({ email: "owner@example.com", available: true });
    requestReset.mockResolvedValue({ token: "abc123-token" });
    sender.send.mockRejectedValue(new MailSenderError("SMTP connection refused"));

    await expect(service.sendResetEmail("target-id", actor)).rejects.toBeInstanceOf(MailSenderError);

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(store.recordRequest).toHaveBeenCalledTimes(1);
    const audit = store.recordRequest.mock.calls[0][0];
    expect(audit.outcome).toBe(PasswordResetRequestOutcome.DELIVERY_FAILED);
  });

  it("never writes the challenge token, email, or SMTP detail into the audit row", async () => {
    const { service, store, sender } = createHarness();
    store.findMerchantForReset.mockResolvedValue({ email: "owner@example.com", available: true });
    requestReset.mockResolvedValue({ token: "secret-token" });
    sender.send.mockRejectedValue(new MailSenderError("SMTP connection refused"));

    await expect(service.sendResetEmail("target-id", actor)).rejects.toBeInstanceOf(MailSenderError);

    const audit = JSON.stringify(store.recordRequest.mock.calls[0][0]);
    expect(audit).not.toContain("secret-token");
    expect(audit).not.toContain("owner@example.com");
    expect(audit).not.toContain("SMTP connection refused");
  });
});
