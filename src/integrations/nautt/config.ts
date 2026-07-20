import "server-only";

import { validateNauttWebhookCallbackUrl } from "./client-webhooks";

const DEFAULT_API_BASE_URL = "https://api.nauttfinance.com/api/v2";

export function loadNauttWebhookCallbackUrl(): string {
  const candidate = process.env.NAUTT_WEBHOOK_CALLBACK_URL;
  if (!candidate) throw new Error("Nautt webhook callback configuration is unavailable");
  return validateNauttWebhookCallbackUrl(candidate);
}

export function loadNauttApiBaseUrl(): string {
  const candidate = process.env.NAUTT_API_BASE_URL;
  if (!candidate) return DEFAULT_API_BASE_URL;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Nautt API base URL configuration is invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Nautt API base URL configuration is invalid");
  }
  return url.toString();
}
