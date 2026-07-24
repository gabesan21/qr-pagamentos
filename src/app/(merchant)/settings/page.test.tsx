import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/i18n/dictionaries";
import type { OwnerNauttStatus } from "@/integrations/nautt/owner-onboarding";

const {
  getCheckoutPolicy,
  getStorefrontSettings,
  readNauttStatus,
  requireContext,
} = vi.hoisted(() => ({
  getCheckoutPolicy: vi.fn(),
  getStorefrontSettings: vi.fn(),
  readNauttStatus: vi.fn(),
  requireContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../shell-context", () => ({ requireMerchantShellContext: requireContext }));
vi.mock("@/auth/checkout-policy", () => ({
  getCheckoutPolicyService: () => ({ getForOwner: getCheckoutPolicy }),
}));
vi.mock("@/auth/storefront-settings", () => ({
  getStorefrontSettingsService: () => ({ getForOwner: getStorefrontSettings }),
}));
vi.mock("@/integrations/nautt/owner-onboarding", async (original) => ({
  ...(await original()),
  getOwnerOnboardingService: () => ({ readStatus: readNauttStatus }),
}));
vi.mock("@/app/checkout-policy-management", () => ({
  CheckoutPolicyManagement: () => <div data-testid="checkout-policy" />,
}));
vi.mock("@/app/storefront-settings-management", () => ({
  StorefrontSettingsManagement: () => <div data-testid="storefront-settings" />,
}));
vi.mock("@/app/language-preference/language-preference-form", () => ({
  LanguagePreferenceSubmit: () => <button type="submit">Save</button>,
}));

import MerchantSettingsPage from "./page";

const emptyCredential = {
  credentialRevision: null,
  hasCredential: false,
  updatedAt: null,
  webhookRegistrationState: null,
};
const principal = {
  createdAt: new Date("2026-07-24T00:00:00Z"),
  email: null,
  id: "user-1",
  role: "USER" as const,
  status: "ACTIVE" as const,
  username: "merchant",
};

function prepare(locale: "en" | "pt-BR", status: OwnerNauttStatus) {
  const dictionary = getDictionary(locale);
  requireContext.mockResolvedValue({ dictionary, locale, principal });
  readNauttStatus.mockResolvedValue(status);
  getCheckoutPolicy.mockResolvedValue({ checkoutDataPolicy: "NONE" });
  getStorefrontSettings.mockResolvedValue({
    storefrontAccentColor: null,
    storefrontDisplayNameEn: null,
    storefrontDisplayNamePtBr: null,
    storefrontEnabled: false,
    storefrontSlug: null,
  });
  return dictionary;
}

describe("merchant Settings page Nautt feedback", () => {
  it.each(["en", "pt-BR"] as const)(
    "renders every localized Nautt mutation result after a re-authorized status read in %s",
    async (locale) => {
      const status = { credential: emptyCredential, balance: null, balanceUnavailable: false };
      const dictionary = prepare(locale, status);
      const notices = [
        ["configured", dictionary.nauttConfigured],
        ["invalid", dictionary.nauttInvalid],
        ["changed", dictionary.nauttChanged],
        ["recovery", dictionary.nauttRecoveryRequired],
        ["reset", dictionary.nauttResetDone],
        ["unavailable", dictionary.nauttUnavailable],
      ] as const;

      for (const [code, copy] of notices) {
        readNauttStatus.mockClear();
        const html = renderToStaticMarkup(await MerchantSettingsPage({
          searchParams: Promise.resolve({ nautt: code }),
        }));

        expect(requireContext).toHaveBeenCalled();
        expect(readNauttStatus).toHaveBeenCalledOnce();
        expect(readNauttStatus).toHaveBeenCalledWith(principal);
        expect(html).toContain(copy);
        expect(html).not.toMatch(/provider detail|private-key|credentialRevision/);
      }
    },
  );

  it.each(["en", "pt-BR"] as const)(
    "renders the localized balance retry back to Settings after a fresh status read in %s",
    async (locale) => {
      const status: OwnerNauttStatus = {
        credential: {
          ...emptyCredential,
          credentialRevision: "redacted-revision",
          hasCredential: true,
          updatedAt: new Date("2026-07-24T00:00:00Z"),
          webhookRegistrationState: "ACTIVE",
        },
        balance: null,
        balanceUnavailable: true,
      };
      const dictionary = prepare(locale, status);

      const html = renderToStaticMarkup(await MerchantSettingsPage({
        searchParams: Promise.resolve({}),
      }));

      expect(readNauttStatus).toHaveBeenCalledWith(principal);
      expect(html).toContain(dictionary.nauttRetryBalance);
      expect(html).toContain('href="/settings"');
      expect(html).not.toContain("redacted-revision");
    },
  );
});
