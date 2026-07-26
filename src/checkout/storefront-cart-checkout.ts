import "server-only";

import { getDatabaseClient } from "@/db/client";
import type { Principal } from "@/auth/authorization";
import { getPaymentLinkV2Service } from "@/auth/payment-link-v2";

// Sessionless storefront cart checkout (9.1.3): the browser cart contributes
// only product identity and quantity. Owner, currency, and the registry pair
// derive exclusively from locked persisted rows (owner, products, and pair FOR
// SHARE, the same service-fenced active-dependency posture as payment-link-v2
// creation), and issuance reuses the delivered V2 payment-link service with a
// principal synthesized from the locked owner row — never the owner POST route
// and never authority beyond the active merchant owner. One command issues one
// active SINGLE_USE PRODUCT_LINES link; there is no cart table, order,
// attempt, or provider call at issuance (9.3.1 consumes the link).
const SLUG_PATTERN = /^[a-z0-9](-?[a-z0-9])*$/;
const SLUG_MAXIMUM_LENGTH = 63;
const REFERENCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAXIMUM_LINES = 20;
const MINIMUM_QUANTITY = 1;
const MAXIMUM_QUANTITY = 9_999;

export type StorefrontCartCheckoutLine = Readonly<{
  reference: string;
  quantity: number;
}>;

export type StorefrontCartCheckoutResult =
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "issued"; paymentLinkIdentifier: string }>;

export type StorefrontCartCheckoutRevalidation =
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "ready"; owner: Principal; currencyPairId: string }>;

export type StorefrontCartCheckoutStore = Readonly<{
  revalidate(slug: string, lines: readonly StorefrontCartCheckoutLine[]): Promise<StorefrontCartCheckoutRevalidation>;
}>;

type Dependencies = Readonly<{
  issueLink(actor: Principal, input: Readonly<Record<string, unknown>>): Promise<Readonly<{ identifier: string }>>;
}>;

type LockedOwner = Readonly<{
  id: string;
  username: string;
  email: string | null;
  role: string;
  status: string;
  createdAt: Date;
  defaultCurrencyCode: string | null;
}>;

// Product-only contract: exactly one `items` array of exactly
// `{ reference, quantity }` members, so a custom-amount entry, a tampered
// price/currency/title key, or any foreign shape is the same opaque invalid.
function parseLines(input: unknown): StorefrontCartCheckoutLine[] | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const body = input as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !Array.isArray(body.items)) return null;
  if (body.items.length < 1 || body.items.length > MAXIMUM_LINES) return null;
  const seen = new Set<string>();
  const lines: StorefrontCartCheckoutLine[] = [];
  for (const entry of body.items as unknown[]) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const item = entry as Record<string, unknown>;
    if (Object.keys(item).length !== 2
      || typeof item.reference !== "string"
      || !REFERENCE_PATTERN.test(item.reference)
      || typeof item.quantity !== "number"
      || !Number.isInteger(item.quantity)
      || item.quantity < MINIMUM_QUANTITY
      || item.quantity > MAXIMUM_QUANTITY) return null;
    const reference = item.reference.toLowerCase();
    if (seen.has(reference)) return null;
    seen.add(reference);
    lines.push({ reference, quantity: item.quantity });
  }
  return lines;
}

export function createStorefrontCartCheckoutService(store: StorefrontCartCheckoutStore, dependencies: Dependencies) {
  return {
    async checkout(slug: unknown, input: unknown): Promise<StorefrontCartCheckoutResult> {
      if (typeof slug !== "string" || slug.length > SLUG_MAXIMUM_LENGTH || !SLUG_PATTERN.test(slug)) return { kind: "invalid" };
      const lines = parseLines(input);
      if (!lines) return { kind: "invalid" };
      const revalidation = await store.revalidate(slug, lines);
      if (revalidation.kind !== "ready") return revalidation;
      // Thrown issuance faults (identifier-collision conflict or the
      // dependency-deactivation race surfacing as PaymentLinkV2DependencyError)
      // propagate to the request-log failed record, never a mapped body.
      const link = await dependencies.issueLink(revalidation.owner, {
        compositionKind: "PRODUCT_LINES",
        currencyPairId: revalidation.currencyPairId,
        linkType: "SINGLE_USE",
        expiresAt: null,
        lines: JSON.stringify(lines.map((line) => ({ productId: line.reference, quantity: line.quantity }))),
      });
      return { kind: "issued", paymentLinkIdentifier: link.identifier };
    },
  };
}

export function createPrismaStorefrontCartCheckoutStore(db = getDatabaseClient()): StorefrontCartCheckoutStore {
  return {
    async revalidate(slug, lines) {
      return db.$transaction(async (transaction) => {
        const owners = await transaction.$queryRaw<LockedOwner[]>`
          SELECT u."id", u."username", u."email", u."role", u."status",
            u."created_at" AS "createdAt", u."storefront_default_currency_code" AS "defaultCurrencyCode"
          FROM "app"."user" u
          WHERE u."storefront_slug" = ${slug} AND u."storefront_enabled" = true
          FOR SHARE OF u
        `;
        const owner = owners[0];
        // The sessionless path never mints authority beyond the active merchant
        // owner: an administrator or a disabled account is the unavailable store.
        if (!owner || owner.role !== "USER" || owner.status !== "ACTIVE") return { kind: "unavailable" } as const;

        const references = lines.map((line) => line.reference);
        const products = await transaction.$queryRaw<ReadonlyArray<Readonly<{ id: string; currencyCode: string | null }>>>`
          SELECT p."id", p."currency_code" AS "currencyCode"
          FROM "app"."product" p
          WHERE p."owner_id" = ${owner.id}::uuid AND p."id" = ANY(${references}::uuid[])
            AND p."active" = true AND p."archived_at" IS NULL
          FOR SHARE OF p
        `;
        if (products.length !== references.length) return { kind: "invalid" } as const;

        // Single-currency rule: every line resolves product code ?? store
        // default to one identical code with an active registry mapping; null,
        // mixed, or unmapped codes are the one opaque invalid outcome.
        const codes = new Set(products.map((product) => product.currencyCode ?? owner.defaultCurrencyCode));
        if (codes.size !== 1) return { kind: "invalid" } as const;
        const [code] = codes;
        if (!code) return { kind: "invalid" } as const;
        const pairs = await transaction.$queryRaw<ReadonlyArray<Readonly<{ id: string }>>>`
          SELECT c."id"
          FROM "app"."supported_exchange_currency" s
          JOIN "app"."catalog_currency_pair" c ON c."id" = s."pair_id"
          WHERE s."code" = ${code} AND c."active" = true
          FOR SHARE OF c
        `;
        const pair = pairs[0];
        if (!pair) return { kind: "invalid" } as const;

        return {
          kind: "ready",
          owner: {
            id: owner.id,
            username: owner.username,
            email: owner.email,
            role: owner.role as Principal["role"],
            status: owner.status as Principal["status"],
            createdAt: owner.createdAt,
          },
          currencyPairId: pair.id,
        } as const;
      });
    },
  };
}

let shared: ReturnType<typeof createStorefrontCartCheckoutService> | undefined;
export function getStorefrontCartCheckoutService() {
  shared ??= createStorefrontCartCheckoutService(createPrismaStorefrontCartCheckoutStore(), {
    issueLink: (actor, input) => getPaymentLinkV2Service().create(actor, input),
  });
  return shared;
}
