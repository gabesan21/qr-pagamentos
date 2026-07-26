import "server-only";

import { getDatabaseClient } from "@/db/client";
import { DEFAULT_STOREFRONT_THEME_ID } from "@/design-system/themes";
import type { SupportedLocale } from "@/i18n/locales";
import { totalFromLines } from "@/orders/order-v2";
import type { CheckoutDataPolicy } from "@/orders/payment-link-order";

// Sessionless Commerce V2 checkout presentation (9.3.1): the read behind the
// additive /pay/[identifier] V2 branch. The DTO carries only the localized
// composition, the seam-derived exact total, the registry display code, the
// owner checkout policy, and the owner's persisted branding resolved with
// design-system defaults — never owner identity, pair UUIDs, link state,
// version, timestamps, or credential/provider data. Branding resolves from
// the owner record itself, independent of the storefront-enabled flag.
export type PublicCheckoutV2Presentation = Readonly<{
  composition: Readonly<
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
  currencyCode: string | null;
  checkoutPolicy: CheckoutDataPolicy;
  branding: Readonly<{
    displayName: string | null;
    accentColor: string | null;
    themeId: string;
    logoMediaIdentifier: string | null;
  }>;
}>;

export type PublicCheckoutV2PresentationRecord = Readonly<{
  compositionKind: "PRODUCT_LINES" | "FIXED_AMOUNT";
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  amount: string | null;
  currencyCode: string | null;
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
  findAvailableByIdentifier(identifier: string, now: Date): Promise<PublicCheckoutV2PresentationRecord | null>;
}>;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{24}$/;

function projectPresentation(record: PublicCheckoutV2PresentationRecord, locale: SupportedLocale): PublicCheckoutV2Presentation | null {
  let composition: PublicCheckoutV2Presentation["composition"];
  if (record.compositionKind === "FIXED_AMOUNT") {
    // Fail closed on a composition the service fences make impossible.
    const description = locale === "pt-BR" ? record.descriptionPtBr : record.descriptionEn;
    if (description === null || record.amount === null) return null;
    composition = { kind: "FIXED_AMOUNT", description, amount: record.amount };
  } else {
    if (record.lines.length === 0) return null;
    composition = {
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

  return {
    composition,
    currencyCode: record.currencyCode,
    checkoutPolicy: record.owner.checkoutDataPolicy,
    branding: {
      displayName: locale === "pt-BR" ? record.owner.storefrontDisplayNamePtBr : record.owner.storefrontDisplayNameEn,
      accentColor: record.owner.storefrontAccentColor,
      themeId: record.owner.storefrontThemeId ?? DEFAULT_STOREFRONT_THEME_ID,
      logoMediaIdentifier: record.owner.storefrontLogoMediaIdentifier,
    },
  };
}

export function createPublicCheckoutV2PresentationService(
  store: PublicCheckoutV2PresentationStore,
  now: () => Date = () => new Date(),
) {
  return {
    async read(identifier: unknown, locale: SupportedLocale): Promise<PublicCheckoutV2Presentation | null> {
      if (typeof identifier !== "string" || !IDENTIFIER_PATTERN.test(identifier)) return null;
      const record = await store.findAvailableByIdentifier(identifier, now());
      return record ? projectPresentation(record, locale) : null;
    },
  };
}

function prismaStore(): PublicCheckoutV2PresentationStore {
  const db = getDatabaseClient();
  return {
    async findAvailableByIdentifier(identifier, now) {
      const link = await db.paymentLinkV2.findFirst({
        where: { identifier, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: {
          compositionKind: true,
          descriptionPtBr: true,
          descriptionEn: true,
          amount: true,
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
      // One opaque null: malformed, missing, inactive, expired, a publicly
      // inactive line product (V1 deactivation semantics), and a consumed
      // single-use link are indistinguishable.
      if (!link || link.lines.some((line) => !line.product.active)) return null;
      if (link.linkType === "SINGLE_USE" && link.singleUseSettlement) return null;
      // Display metadata only: the code whose active registry pointer maps the
      // locked pair; an unmapped pair is explicit unlabeled, never a fallback.
      const pointer = await db.supportedExchangeCurrency.findFirst({ where: { pairId: link.currencyPairId }, select: { code: true } });
      return {
        compositionKind: link.compositionKind as PublicCheckoutV2PresentationRecord["compositionKind"],
        descriptionPtBr: link.descriptionPtBr,
        descriptionEn: link.descriptionEn,
        amount: link.amount,
        currencyCode: pointer?.code ?? null,
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
