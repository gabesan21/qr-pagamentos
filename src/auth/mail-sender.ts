import "server-only";

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

// Thin abstraction over SMTP transport. The concrete transport implementation
// will be wired once the password-reset flow is assembled in later fronts;
// the config parameter is part of the public contract for that wiring.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createMailSender(_config: SmtpConfig): MailSender {
  return {
    async send() {
      throw new MailSenderError("SMTP transport is not yet implemented");
    },
  };
}
