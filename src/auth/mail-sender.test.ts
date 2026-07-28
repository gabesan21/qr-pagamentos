import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const sendMail = vi.fn();
  const createTransport = vi.fn(() => ({ sendMail }));
  return { sendMail, createTransport };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
  createTransport: mocks.createTransport,
}));

import { createMailSender, MailSenderError } from "./mail-sender";

const { sendMail, createTransport } = mocks;

const config = {
  host: "smtp.example.com",
  port: 587,
  user: "user@example.com",
  password: "secret",
  from: "noreply@example.com",
  tlsMode: "starttls" as const,
};

describe("createMailSender", () => {
  it("returns a sender object", () => {
    const sender = createMailSender(config);
    expect(sender).toHaveProperty("send");
    expect(typeof sender.send).toBe("function");
  });

  it("configures the transport from the SMTP config", () => {
    createMailSender(config);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 587,
        secure: false,
        requireTLS: true,
        ignoreTLS: false,
        auth: { user: "user@example.com", pass: "secret" },
      }),
    );
  });

  it.each([
    ["none", { secure: false, requireTLS: false, ignoreTLS: true }],
    ["starttls", { secure: false, requireTLS: true, ignoreTLS: false }],
    ["tls", { secure: true, requireTLS: false, ignoreTLS: false }],
  ] as const)("maps tlsMode %s to transport options %o", (tlsMode, expected) => {
    createTransport.mockClear();
    createMailSender({ ...config, tlsMode });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it("sends the message through the transport", async () => {
    sendMail.mockResolvedValueOnce({ messageId: "<msg@example.com>" });
    const sender = createMailSender(config);

    await sender.send({
      to: "recipient@example.com",
      subject: "Reset",
      text: "Reset your password",
      html: "<p>Reset your password</p>",
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: "noreply@example.com",
      to: "recipient@example.com",
      subject: "Reset",
      text: "Reset your password",
      html: "<p>Reset your password</p>",
    });
  });

  it("wraps transport failures in MailSenderError", async () => {
    sendMail.mockRejectedValueOnce(new Error("SMTP connection refused"));
    const sender = createMailSender(config);

    await expect(
      sender.send({
        to: "recipient@example.com",
        subject: "Reset",
        text: "Reset your password",
      }),
    ).rejects.toBeInstanceOf(MailSenderError);
  });
});
