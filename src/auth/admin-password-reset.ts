import "server-only";

import { getDatabaseClient } from "../db/client";

import { createMailSender, type MailSender, type MailMessage } from "./mail-sender";
import { loadPublicOrigin, loadSmtpConfig, type SmtpConfig } from "./mail-config";
import { getPasswordResetService } from "./password-reset";

export class AdminPasswordResetUnavailableError extends Error {}

export type AdminPasswordResetStore = Readonly<{
  findActiveMerchantWithEmail(id: string): Promise<{ email: string } | null>;
}>;

export type AdminPasswordResetDeps = Readonly<{
  config: SmtpConfig;
  origin: string;
  sender: MailSender;
}>;

function buildResetMessage(origin: string, token: string, email: string): MailMessage {
  const resetUrl = `${origin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to: email,
    subject: "Password reset / Redefinição de senha",
    text: `Reset your password: ${resetUrl}\n\nRedefina sua senha: ${resetUrl}`,
    html: `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p><p>Redefina sua senha: <a href="${resetUrl}">${resetUrl}</a></p>`,
  };
}

export function createAdminPasswordResetService(store: AdminPasswordResetStore, deps: AdminPasswordResetDeps) {
  return {
    async sendResetEmail(targetId: string) {
      const user = await store.findActiveMerchantWithEmail(targetId);
      if (!user) throw new AdminPasswordResetUnavailableError("Reset is unavailable");
      const { token } = await getPasswordResetService().requestReset(user.email);
      await deps.sender.send(buildResetMessage(deps.origin, token, user.email));
    },
  };
}

export type AdminPasswordResetService = ReturnType<typeof createAdminPasswordResetService>;

function prismaStore(): AdminPasswordResetStore {
  const db = getDatabaseClient();
  return {
    async findActiveMerchantWithEmail(id) {
      const row = await db.user.findUnique({
        where: { id, role: "USER", status: "ACTIVE", deletedAt: null },
        select: { email: true },
      });
      if (!row || row.email === null) return null;
      return { email: row.email };
    },
  };
}

export function getAdminPasswordResetService(): AdminPasswordResetService {
  return createAdminPasswordResetService(prismaStore(), {
    config: loadSmtpConfig(),
    origin: loadPublicOrigin(),
    sender: createMailSender(loadSmtpConfig()),
  });
}
