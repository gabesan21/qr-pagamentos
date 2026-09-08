import { describe, expect, it, vi } from "vitest";

const { requireOwnerFromCookie, resolveLocale, getForOwner } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  getForOwner: vi.fn(),
}));
const redirect = vi.hoisted(() => vi.fn((location: string) => { throw new Error(`redirect:${location}`); }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../owner-guard", () => ({ requireOwnerFromCookie }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/storefront-settings", () => ({ getStorefrontSettingsService: () => ({ getForOwner }) }));

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import { getDictionary } from "@/i18n/dictionaries";
import { requireMerchantShellContext } from "./shell-context";

const owner = { id: "user-1", username: "lojista", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };

describe("merchant shell context", () => {
  it("resolves the dictionary, locale, and principal for a merchant", async () => {
    requireOwnerFromCookie.mockResolvedValueOnce(owner);
    resolveLocale.mockResolvedValueOnce("pt-BR");
    getForOwner.mockResolvedValueOnce({ storefrontEnabled: false, storefrontSlug: null });

    const context = await requireMerchantShellContext();

    expect(context.principal).toBe(owner);
    expect(context.locale).toBe("pt-BR");
    expect(context.dictionary).toBe(getDictionary("pt-BR"));
  });

  it("resolves a storefront link only when the storefront is enabled and slugged", async () => {
    requireOwnerFromCookie.mockResolvedValueOnce(owner);
    resolveLocale.mockResolvedValueOnce("pt-BR");
    getForOwner.mockResolvedValueOnce({ storefrontEnabled: true, storefrontSlug: "lojista-slug" });

    const context = await requireMerchantShellContext();

    expect(context.storefrontLink).toEqual({ href: "/store/lojista-slug", label: getDictionary("pt-BR").shellStorefront });
  });

  it("omits the storefront link when disabled or slugless", async () => {
    requireOwnerFromCookie.mockResolvedValueOnce(owner);
    resolveLocale.mockResolvedValueOnce("pt-BR");
    getForOwner.mockResolvedValueOnce({ storefrontEnabled: false, storefrontSlug: "lojista-slug" });

    const disabledContext = await requireMerchantShellContext();
    expect(disabledContext.storefrontLink).toBeUndefined();

    requireOwnerFromCookie.mockResolvedValueOnce(owner);
    resolveLocale.mockResolvedValueOnce("pt-BR");
    getForOwner.mockResolvedValueOnce({ storefrontEnabled: true, storefrontSlug: null });

    const slugelessContext = await requireMerchantShellContext();
    expect(slugelessContext.storefrontLink).toBeUndefined();
  });

  it("redirects unauthenticated visitors to login before any page work", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new UnauthenticatedError("missing"));

    await expect(requireMerchantShellContext()).rejects.toThrow("redirect:/login");
  });

  it("redirects active administrators to the admin root before any page work", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new ForbiddenError("wrong role"));

    await expect(requireMerchantShellContext()).rejects.toThrow("redirect:/admin");
  });
});
