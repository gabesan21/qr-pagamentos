import "server-only";

import { randomUUID } from "node:crypto";

import { getDatabaseClient } from "../db/client";

import {
  createMailSender,
  MailSenderError,
  type MailSender,
  type MailMessage,
} from "./mail-sender";
import { loadPublicOrigin, loadSmtpConfig, type SmtpConfig } from "./mail-config";
import { getPasswordResetService, PasswordResetRateLimitError } from "./password-reset";
import type { Principal } from "./authorization";

export class AdminPasswordResetUnavailableError extends Error {}

export const PasswordResetRequestOutcome = {
  SENT: "SENT",
  NO_EMAIL: "NO_EMAIL",
  UNAVAILABLE: "UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  DELIVERY_FAILED: "DELIVERY_FAILED",
} as const;
export type PasswordResetRequestOutcome =
  (typeof PasswordResetRequestOutcome)[keyof typeof PasswordResetRequestOutcome];

export type PasswordResetRequestAudit = Readonly<{
  id: string;
  userId: string;
  actorId: string;
  outcome: PasswordResetRequestOutcome;
  createdAt: Date;
}>;

export type AdminPasswordResetStore = Readonly<{
  findMerchantForReset(
    id: string,
  ): Promise<{ email: string | null; available: boolean } | null>;
  recordRequest(audit: PasswordResetRequestAudit): Promise<void>;
}>;

export type AdminPasswordResetDeps = Readonly<{
  config: SmtpConfig;
  origin: string;
  sender: MailSender;
  clock: () => Date;
  randomId: () => string;
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

async function recordAudit(
  store: AdminPasswordResetStore,
  deps: AdminPasswordResetDeps,
  fields: Omit<PasswordResetRequestAudit, "id" | "createdAt">,
) {
  await store.recordRequest({
    id: deps.randomId(),
    createdAt: deps.clock(),
    ...fields,
  });
}

export function createAdminPasswordResetService(
  store: AdminPasswordResetStore,
  deps: AdminPasswordResetDeps,
) {
  return {
    async sendResetEmail(targetId: string, actor: Principal) {
      const target = await store.findMerchantForReset(targetId);
      if (!target || !target.available) {
        await recordAudit(store, deps, {
          userId: targetId,
          actorId: actor.id,
          outcome: PasswordResetRequestOutcome.UNAVAILABLE,
        });
        throw new AdminPasswordResetUnavailableError("Reset is unavailable");
      }
      if (target.email === null) {
        await recordAudit(store, deps, {
          userId: targetId,
          actorId: actor.id,
          outcome: PasswordResetRequestOutcome.NO_EMAIL,
        });
        throw new AdminPasswordResetUnavailableError("Reset is unavailable");
      }

      try {
        const { token } = await getPasswordResetService().requestReset(target.email);
        await deps.sender.send(buildResetMessage(deps.origin, token, target.email));
      } catch (error) {
        if (error instanceof PasswordResetRateLimitError) {
          await recordAudit(store, deps, {
            userId: targetId,
            actorId: actor.id,
            outcome: PasswordResetRequestOutcome.RATE_LIMITED,
          });
          throw new AdminPasswordResetUnavailableError("Reset is unavailable");
        }
        if (error instanceof MailSenderError) {
          await recordAudit(store, deps, {
            userId: targetId,
            actorId: actor.id,
            outcome: PasswordResetRequestOutcome.DELIVERY_FAILED,
          });
          throw error;
        }
        throw error;
      }

      await recordAudit(store, deps, {
        userId: targetId,
        actorId: actor.id,
        outcome: PasswordResetRequestOutcome.SENT,
      });
    },
  };
}

export type AdminPasswordResetService = ReturnType<typeof createAdminPasswordResetService>;

function prismaStore(): AdminPasswordResetStore {
  const db = getDatabaseClient();
  return {
    async findMerchantForReset(id) {
      const row = await db.user.findUnique({
        where: { id },
        select: { email: true, role: true, status: true, deletedAt: true },
      });
      if (!row) return null;
      const available = row.role === "USER" && row.status === "ACTIVE" && row.deletedAt === null;
      return { email: row.email, available };
    },
    async recordRequest(audit) {
      await db.passwordResetRequest.create({ data: audit });
    },
  };
}

export function getAdminPasswordResetService(): AdminPasswordResetService {
  const config = loadSmtpConfig();
  return createAdminPasswordResetService(prismaStore(), {
    config,
    origin: loadPublicOrigin(),
    sender: createMailSender(config),
    clock: () => new Date(),
    randomId: () => randomUUID(),
  });
}
