import "server-only";

import { validateNauttWebhookCallbackUrl } from "./client-webhooks";

export function loadNauttWebhookCallbackUrl(): string {
  const candidate = process.env.NAUTT_WEBHOOK_CALLBACK_URL;
  if (!candidate) throw new Error("Nautt webhook callback configuration is unavailable");
  return validateNauttWebhookCallbackUrl(candidate);
}
