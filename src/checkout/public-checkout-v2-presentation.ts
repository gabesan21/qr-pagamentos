import "server-only";

import { getDatabaseClient } from "@/db/client";
import { DEFAULT_STOREFRONT_THEME_ID } from "@/design-system/themes";
import type { SupportedLocale } from "@/i18n/locales";
import { totalFromLines } from "@/orders/order-v2";
import type { CheckoutDataPolicy } from "@/orders/payment-link-order";

// Sessionless Commerce V2 checkout presentation (9.3.1): the read behind the
// additive /pay/[identifier] V2 branch. The checkout DTO carries only the
// localized composition, the seam-derived exact total, the registry display
// code, the owner checkout policy, and the owner's persisted branding
// resolved with design-system defaults — never owner identity, pair UUIDs,
// link state, version, timestamps, or credential/provider data. Branding
// resolves from the owner record itself, independent of the storefront-
// enabled flag. 9.3.2 added the paid terminal branch: a consumed SINGLE_USE
// link resolves the paid view from the persisted settlement claim alone
// (never live order state, so a later REFUNDED never flips it), while every
// other non-payable state keeps the one opaque null.
export type PublicCheckoutV2Composition = Readonly<
  | Readonly<{
    kind: "PRODUCT_LINES";
    lines: ReadonlyArray<Readonly<{
      product: Readonly<{ title: string; description: string; price: string }>;
      quantity: number;
    }>>;
    total: string;
  }>
  | Readonly<{
    kind: "FIXED_AMOUNT";
    description: string;
    amount: string;
  }>
>;

export type PublicCheckoutV2Branding = Readonly<{
  displayName: string | null;
  accentColor: string | null;
  themeId: string;
  logoMediaIdentifier: string | null;
}>;

export type PublicCheckoutV2Presentation = Readonly<{
  composition: PublicCheckoutV2Composition;
  currencyCode: string | null;
  checkoutPolicy: CheckoutDataPolicy;
  branding: PublicCheckoutV2Branding;
}>;

// The paid terminal view (9.3.2): exactly the already-public composition
// summary, exact total, display code, and branding — never the checkout
// policy, order/payment state or any timestamp (including the claim's
// claimedAt and orderV2Id), refund state, payer data, attempt/capability
// material, provider data, pair UUIDs, or link internals.
export type PublicCheckoutV2PaidPresentation = Readonly<{
  composition: PublicCheckoutV2Composition;
  currencyCode: string | null;
  branding: PublicCheckoutV2Branding;
}>;

export type PublicCheckoutV2PresentationOutcome = Readonly<
  | Readonly<{ kind: "checkout"; presentation: PublicCheckoutV2Presentation }>
  | Readonly<{ kind: "paid"; paid: PublicCheckoutV2PaidPresentation }>
> | null;

export type PublicCheckoutV2PresentationRecord = Readonly<{
  compositionKind: "PRODUCT_LINES" | "FIXED_AMOUNT";
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  amount: string | null;
  currencyCode: string | null;
  consumed: boolean;
  lines: ReadonlyArray<Readonly<{
    quantity: number;
    product: Readonly<{
      titlePtBr: string;
      titleEn: string;
      descriptionPtBr: string;
      descriptionEn: string;
      price: string;
    }>;
  }>>;
  owner: Readonly<{
    checkoutDataPolicy: CheckoutDataPolicy;
    storefrontDisplayNamePtBr: string | null;
    storefrontDisplayNameEn: string | null;
    storefrontAccentColor: string | null;
    storefrontThemeId: string | null;
    storefrontLogoMediaIdentifier: string | null;
  }>;
}>;

export type PublicCheckoutV2PresentationStore = Readonly<{
  findByIdentifier(identifier: string, now: Date): Promise<PublicCheckoutV2PresentationRecord | null>;
}>;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{24}$/;

function projectComposition(record: PublicCheckoutV2PresentationRecord, locale: SupportedLocale): PublicCheckoutV2Composition | null {
  if (record.compositionKind === "FIXED_AMOUNT") {
    // Fail closed on a composition the service fences make impossible.
    const description = locale === "pt-BR" ? record.descriptionPtBr : record.descriptionEn;
    if (description === null || record.amount === null) return null;
    return { kind: "FIXED_AMOUNT", description, amount: record.amount };
  }
  if (record.lines.length === 0) return null;
  return {
    kind: "PRODUCT_LINES",
    lines: record.lines.map((line) => ({
      product: locale === "pt-BR"
        ? { title: line.product.titlePtBr, description: line.product.descriptionPtBr, price: line.product.price }
        : { title: line.product.titleEn, description: line.product.descriptionEn, price: line.product.price },
      quantity: line.quantity,
    })),
    total: totalFromLines(record.lines.map((line) => ({ quantity: line.quantity, unitPrice: line.product.price }))),
  };
}

function projectBranding(record: PublicCheckoutV2PresentationRecord, locale: SupportedLocale): PublicCheckoutV2Branding {
  return {
    displayName: locale === "pt-BR" ? record.owner.storefrontDisplayNamePtBr : record.owner.storefrontDisplayNameEn,
    accentColor: record.owner.storefrontAccentColor,
    themeId: record.owner.storefrontThemeId ?? DEFAULT_STOREFRONT_THEME_ID,
    logoMediaIdentifier: record.owner.storefrontLogoMediaIdentifier,
  };
}

export function createPublicCheckoutV2PresentationService(
  store: PublicCheckoutV2PresentationStore,
  now: () => Date = () => new Date(),
) {
  return {
    async read(identifier: unknown, locale: SupportedLocale): Promise<PublicCheckoutV2PresentationOutcome> {
      if (typeof identifier !== "string" || !IDENTIFIER_PATTERN.test(identifier)) return null;
      const record = await store.findByIdentifier(identifier, now());
      if (!record) return null;
      const composition = projectComposition(record, locale);
      if (!composition) return null;
      const branding = projectBranding(record, locale);
      // The persisted claim flag is the only consumption signal: it, never
      // live order state, selects the paid terminal branch.
      return record.consumed
        ? { kind: "paid", paid: { composition, currencyCode: record.currencyCode, branding } }
        : { kind: "checkout", presentation: { composition, currencyCode: record.currencyCode, checkoutPolicy: record.owner.checkoutDataPolicy, branding } };
    },
  };
}

function prismaStore(): PublicCheckoutV2PresentationStore {
  const db = getDatabaseClient();
  return {
    async findByIdentifier(identifier, now) {
      const link = await db.paymentLinkV2.findFirst({
        where: { identifier },
        select: {
          compositionKind: true,
          descriptionPtBr: true,
          descriptionEn: true,
          amount: true,
          active: true,
          expiresAt: true,
          linkType: true,
          currencyPairId: true,
          lines: {
            select: {
              quantity: true,
              product: { select: { titlePtBr: true, titleEn: true, descriptionPtBr: true, descriptionEn: true, price: true, active: true } },
            },
            orderBy: { position: "asc" },
          },
          owner: {
            select: {
              checkoutDataPolicy: true,
              storefrontDisplayNamePtBr: true,
              storefrontDisplayNameEn: true,
              storefrontAccentColor: true,
              storefrontThemeId: true,
              storefrontLogoMediaIdentifier: true,
            },
          },
          singleUseSettlement: { select: { paymentLinkV2Id: true } },
        },
      });
      if (!link) return null;
      // The persisted single-use settlement claim is the only consumption
      // signal: a claimed link renders the paid terminal view unconditionally
      // (later deactivation, expiry, line-product deactivation, or any order
      // state change never flips it), while an unclaimed link keeps every
      // availability gate — malformed, missing, inactive, expired, and a
      // publicly inactive line product share the one opaque null.
      const consumed = link.linkType === "SINGLE_USE" && link.singleUseSettlement !== null;
      if (!consumed && (!link.active || (link.expiresAt !== null && link.expiresAt <= now))) return null;
      if (!consumed && link.lines.some((line) => !line.product.active)) return null;
      // Display metadata only: the code whose active registry pointer maps the
      // locked pair; an unmapped pair is explicit unlabeled, never a fallback.
      const pointer = await db.supportedExchangeCurrency.findFirst({ where: { pairId: link.currencyPairId }, select: { code: true } });
      return {
        compositionKind: link.compositionKind as PublicCheckoutV2PresentationRecord["compositionKind"],
        descriptionPtBr: link.descriptionPtBr,
        descriptionEn: link.descriptionEn,
        amount: link.amount,
        currencyCode: pointer?.code ?? null,
        consumed,
        lines: link.lines.map((line) => ({
          quantity: line.quantity,
          product: {
            titlePtBr: line.product.titlePtBr,
            titleEn: line.product.titleEn,
            descriptionPtBr: line.product.descriptionPtBr,
            descriptionEn: line.product.descriptionEn,
            price: line.product.price,
          },
        })),
        owner: link.owner as PublicCheckoutV2PresentationRecord["owner"],
      };
    },
  };
}

export function getPublicCheckoutV2PresentationService() {
  return createPublicCheckoutV2PresentationService(prismaStore());
}
