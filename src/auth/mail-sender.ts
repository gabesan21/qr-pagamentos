import "server-only";

import nodemailer from "nodemailer";
import type { SmtpConfig } from "./mail-config.ts";

export type MailMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  html?: string;
}>;

export type MailSender = Readonly<{
  send(message: MailMessage): Promise<void>;
}>;

export class MailSenderError extends Error {}

function buildTransportOptions(config: SmtpConfig) {
  return {
    host: config.host,
    port: config.port,
    secure: config.tlsMode === "tls",
    requireTLS: config.tlsMode === "starttls",
    ignoreTLS: config.tlsMode === "none",
    auth: {
      user: config.user,
      pass: config.password,
    },
  };
}

export function createMailSender(config: SmtpConfig): MailSender {
  const transport = nodemailer.createTransport(buildTransportOptions(config));

  return {
    async send(message: MailMessage) {
      try {
        await transport.sendMail({
          from: config.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      } catch (cause) {
        throw new MailSenderError("Failed to send email", { cause });
      }
    },
  };
}
