import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMailSender, MailSenderError } from "./mail-sender";

describe("createMailSender", () => {
  it("returns a sender object", () => {
    const sender = createMailSender({
      host: "smtp.example.com",
      port: 587,
      user: "user@example.com",
      password: "secret",
      from: "noreply@example.com",
      tlsMode: "starttls",
    });
    expect(sender).toHaveProperty("send");
    expect(typeof sender.send).toBe("function");
  });

  it("rejects every send with a typed not-implemented error", async () => {
    const sender = createMailSender({
      host: "smtp.example.com",
      port: 587,
      user: "user@example.com",
      password: "secret",
      from: "noreply@example.com",
      tlsMode: "starttls",
    });
    await expect(
      sender.send({
        to: "recipient@example.com",
        subject: "Reset",
        text: "Reset your password",
      }),
    ).rejects.toThrow(MailSenderError);
    await expect(
      sender.send({
        to: "recipient@example.com",
        subject: "Reset",
        text: "Reset your password",
      }),
    ).rejects.toThrowError("SMTP transport is not yet implemented");
  });
});
