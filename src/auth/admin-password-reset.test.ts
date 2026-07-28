import { beforeEach, describe, expect, it, vi, type Mocked } from "vitest";

vi.mock("server-only", () => ({}));

const { requestReset } = vi.hoisted(() => ({ requestReset: vi.fn() }));

vi.mock("@/auth/password-reset", () => ({
  getPasswordResetService: () => ({ requestReset }),
}));

import {
  AdminPasswordResetUnavailableError,
  createAdminPasswordResetService,
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

function createHarness() {
  const store: Mocked<AdminPasswordResetStore> = {
    findActiveMerchantWithEmail: vi.fn(),
  };
  const sender = { send: vi.fn() };
  const service = createAdminPasswordResetService(store, { config, origin, sender });
  return { service, store, sender };
}

beforeEach(() => vi.clearAllMocks());

describe("admin password reset service", () => {
  it("sends a bilingual reset message with a canonical token link on success", async () => {
    const { service, store, sender } = createHarness();
    store.findActiveMerchantWithEmail.mockResolvedValue({ email: "owner@example.com" });
    requestReset.mockResolvedValue({ token: "abc123-token" });

    await service.sendResetEmail("target-id");

    expect(store.findActiveMerchantWithEmail).toHaveBeenCalledWith("target-id");
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
  });

  it("is unavailable when the target has no email", async () => {
    const { service, store, sender } = createHarness();
    store.findActiveMerchantWithEmail.mockResolvedValue(null);

    await expect(service.sendResetEmail("target-id")).rejects.toBeInstanceOf(AdminPasswordResetUnavailableError);

    expect(requestReset).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("is unavailable when the target is inactive or deleted", async () => {
    const { service, store, sender } = createHarness();
    store.findActiveMerchantWithEmail.mockResolvedValue(null);

    await expect(service.sendResetEmail("inactive-id")).rejects.toBeInstanceOf(AdminPasswordResetUnavailableError);

    expect(store.findActiveMerchantWithEmail).toHaveBeenCalledWith("inactive-id");
    expect(requestReset).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("propagates send failures without exposing configuration", async () => {
    const { service, store, sender } = createHarness();
    store.findActiveMerchantWithEmail.mockResolvedValue({ email: "owner@example.com" });
    requestReset.mockResolvedValue({ token: "abc123-token" });
    sender.send.mockRejectedValue(new MailSenderError("SMTP connection refused"));

    await expect(service.sendResetEmail("target-id")).rejects.toBeInstanceOf(MailSenderError);

    expect(sender.send).toHaveBeenCalledTimes(1);
  });
});
