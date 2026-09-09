import "server-only";

import { getDatabaseClient } from "@/db/client";
import { DEFAULT_STOREFRONT_THEME_ID } from "@/design-system/themes";
import type { SupportedLocale } from "@/i18n/locales";
import type { CheckoutDataPolicy } from "@/orders/payment-link-order";

import type { PublicCheckoutV2Branding } from "./public-checkout-v2-presentation";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{24}$/;

// The same additive branding shape 9.3.1 sanctioned for the V2 checkout DTO
// (localized display name, accent, theme id with the design-system default,
// logo media identifier) — resolved from the owner row this query already
// joins, independent of `storefront_enabled` (14.6.1 F01).
export type PublicCheckoutBranding = PublicCheckoutV2Branding;

export type PublicCheckoutPresentation = Readonly<{
  product: Readonly<{ title: string; description: string; price: string }>;
  checkoutPolicy: CheckoutDataPolicy;
  branding: PublicCheckoutBranding;
}>;

export type PublicCheckoutPresentationRecord = Readonly<{
  product: Readonly<{ titlePtBr: string; titleEn: string; descriptionPtBr: string; descriptionEn: string; price: string }>;
  owner: Readonly<{
    checkoutDataPolicy: CheckoutDataPolicy;
    storefrontDisplayNamePtBr: string | null;
    storefrontDisplayNameEn: string | null;
    storefrontAccentColor: string | null;
    storefrontThemeId: string | null;
    storefrontLogoMediaIdentifier: string | null;
  }>;
}>;

function projectBranding(owner: PublicCheckoutPresentationRecord["owner"], locale: SupportedLocale): PublicCheckoutBranding {
  return {
    displayName: locale === "pt-BR" ? owner.storefrontDisplayNamePtBr : owner.storefrontDisplayNameEn,
    accentColor: owner.storefrontAccentColor,
    themeId: owner.storefrontThemeId ?? DEFAULT_STOREFRONT_THEME_ID,
    logoMediaIdentifier: owner.storefrontLogoMediaIdentifier,
  };
}

export type PublicCheckoutPresentationStore = Readonly<{
  findAvailableByIdentifier(identifier: string, now: Date): Promise<PublicCheckoutPresentationRecord | null>;
}>;

export function createPublicCheckoutPresentationService(
  store: PublicCheckoutPresentationStore,
  now: () => Date = () => new Date(),
) {
  return {
    async read(identifier: unknown, locale: SupportedLocale): Promise<PublicCheckoutPresentation | null> {
      if (typeof identifier !== "string" || !IDENTIFIER_PATTERN.test(identifier)) return null;
      const record = await store.findAvailableByIdentifier(identifier, now());
      if (!record) return null;
      const localized = locale === "pt-BR"
        ? { title: record.product.titlePtBr, description: record.product.descriptionPtBr }
        : { title: record.product.titleEn, description: record.product.descriptionEn };
      return {
        product: { ...localized, price: record.product.price },
        checkoutPolicy: record.owner.checkoutDataPolicy,
        branding: projectBranding(record.owner, locale),
      };
    },
  };
}

function prismaStore(): PublicCheckoutPresentationStore {
  const db = getDatabaseClient();
  return {
    findAvailableByIdentifier(identifier, now) {
      return db.paymentLink.findFirst({
        where: { identifier, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], product: { is: { active: true } } },
        select: {
          product: { select: { titlePtBr: true, titleEn: true, descriptionPtBr: true, descriptionEn: true, price: true } },
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
        },
      }) as Promise<PublicCheckoutPresentationRecord | null>;
    },
  };
}

export function getPublicCheckoutPresentationService() {
  return createPublicCheckoutPresentationService(prismaStore());
}
