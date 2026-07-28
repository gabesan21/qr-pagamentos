import { describe, expect, it, vi } from "vitest";

const { requireAdminFromCookie, resolveLocale } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
}));
const redirect = vi.hoisted(() => vi.fn((location: string) => { throw new Error(`redirect:${location}`); }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./guard", () => ({ requireAdminFromCookie }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import { getDictionary } from "@/i18n/dictionaries";
import { requireAdminShellContext } from "./shell-context";

const admin = { id: "admin-1", username: "operator", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

describe("administrator shell context", () => {
  it("resolves the dictionary, locale, and principal for an administrator", async () => {
    requireAdminFromCookie.mockResolvedValueOnce(admin);
    resolveLocale.mockResolvedValueOnce("en");

    const context = await requireAdminShellContext();

    expect(context.principal).toBe(admin);
    expect(context.locale).toBe("en");
    expect(context.dictionary).toBe(getDictionary("en"));
  });

  it("redirects unauthenticated visitors to login before any page work", async () => {
    requireAdminFromCookie.mockRejectedValueOnce(new UnauthenticatedError("missing"));

    await expect(requireAdminShellContext()).rejects.toThrow("redirect:/login");
  });

  it("redirects active merchants to the merchant root before any page work", async () => {
    requireAdminFromCookie.mockRejectedValueOnce(new ForbiddenError("wrong role"));

    await expect(requireAdminShellContext()).rejects.toThrow("redirect:/");
  });
});
