import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";

export const publicPaymentLinkRateLimitSurface = {
  read: "public-link-read",
  checkout: "public-checkout-submit",
  status: "public-payment-status-poll",
} as const;

export type PublicPaymentLinkRateLimitSurface =
  (typeof publicPaymentLinkRateLimitSurface)[keyof typeof publicPaymentLinkRateLimitSurface];

const RATE_LIMITS: Record<PublicPaymentLinkRateLimitSurface, Readonly<{ burst: number; refillTokensPerMillisecond: number }>> = {
  "public-link-read": { burst: 60, refillTokensPerMillisecond: 60 / 60_000 },
  "public-checkout-submit": { burst: 12, refillTokensPerMillisecond: 12 / 60_000 },
  "public-payment-status-poll": { burst: 120, refillTokensPerMillisecond: 120 / 60_000 },
};

const MAX_ENTRIES = 2_048;
const IDLE_ENTRY_LIFETIME_MILLISECONDS = 10 * 60_000;
const MAX_IP_LITERAL_LENGTH = 45;
const noStoreHeaders = { "Cache-Control": "no-store" };

type LimiterEntry = {
  tokens: number;
  lastRefillAt: number;
  lastTouchedAt: number;
};

type PublicPaymentLinkRateLimiterOptions = Readonly<{
  now?: () => number;
  maxEntries?: number;
}>;

export class PublicPaymentLinkRateLimiter {
  private readonly entries = new Map<string, LimiterEntry>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(options: PublicPaymentLinkRateLimiterOptions = {}) {
    this.now = options.now ?? (() => performance.now());
    this.maxEntries = options.maxEntries ?? MAX_ENTRIES;
  }

  allow(surface: PublicPaymentLinkRateLimitSurface, forwardedFor: string | null): boolean {
    const now = this.now();
    this.removeIdleEntries(now);

    const key = rateLimitKey(surface, forwardedFor);
    const limit = RATE_LIMITS[surface];
    const existing = this.entries.get(key);
    if (existing) {
      const elapsed = Math.max(0, now - existing.lastRefillAt);
      existing.tokens = Math.min(limit.burst, existing.tokens + elapsed * limit.refillTokensPerMillisecond);
      existing.lastRefillAt = Math.max(existing.lastRefillAt, now);
      existing.lastTouchedAt = Math.max(existing.lastTouchedAt, now);
      if (existing.tokens < 1) return false;
      existing.tokens -= 1;
      return true;
    }

    if (this.entries.size >= this.maxEntries) return false;
    this.entries.set(key, { tokens: limit.burst - 1, lastRefillAt: now, lastTouchedAt: now });
    return true;
  }

  private removeIdleEntries(now: number) {
    for (const [key, entry] of this.entries) {
      if (now - entry.lastTouchedAt >= IDLE_ENTRY_LIFETIME_MILLISECONDS) this.entries.delete(key);
    }
  }
}

const publicPaymentLinkRateLimiter = new PublicPaymentLinkRateLimiter();

export function allowPublicPaymentLinkRequest(
  request: Request,
  surface: PublicPaymentLinkRateLimitSurface,
): boolean {
  return publicPaymentLinkRateLimiter.allow(surface, request.headers.get("x-forwarded-for"));
}

export function publicRateLimitResponse(): Response {
  return new Response(null, { status: 429, headers: noStoreHeaders });
}

export function normalizeTrustedClientAddress(value: string | null): string | null {
  if (!value || value.length > MAX_IP_LITERAL_LENGTH || value.trim() !== value) return null;
  if (isIP(value) === 4) return canonicalIpv4(value) ? value : null;
  if (isIP(value) !== 6) return null;

  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    const canonical = hostname.slice(1, -1);
    return canonical === value ? canonical : null;
  } catch {
    return null;
  }
}

function rateLimitKey(surface: PublicPaymentLinkRateLimitSurface, forwardedFor: string | null): string {
  const address = normalizeTrustedClientAddress(forwardedFor);
  if (!address) return `${surface}:anonymous`;
  return `${surface}:${createHash("sha256").update(address).digest("hex")}`;
}

function canonicalIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(part)) return false;
    return Number(part) <= 255;
  });
}
