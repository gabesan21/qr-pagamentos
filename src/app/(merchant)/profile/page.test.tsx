import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/i18n/dictionaries";

const { getProfile, requireContext } = vi.hoisted(() => ({
  getProfile: vi.fn(),
  requireContext: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../shell-context", () => ({ requireMerchantShellContext: requireContext }));
vi.mock("@/auth/profile", () => ({ getProfileService: () => ({ get: getProfile }) }));

import ProfilePage from "./page";

const principal = {
  createdAt: new Date("2026-07-24T00:00:00Z"),
  email: null,
  id: "merchant",
  role: "USER" as const,
  status: "ACTIVE" as const,
  username: "merchant",
};
const profile = { username: "merchant", email: null, version: 0 };

describe("merchant profile page", () => {
  it.each(["en", "pt-BR"] as const)("reads and renders only its active merchant in %s", async (locale) => {
    const dictionary = getDictionary(locale);
    requireContext.mockResolvedValue({ dictionary, locale, principal });
    getProfile.mockResolvedValue(profile);
    const html = renderToStaticMarkup(await ProfilePage({ searchParams: Promise.resolve({ identity: "changed" }) }));
    expect(getProfile).toHaveBeenCalledWith(principal);
    expect(html).toContain(dictionary.profileTitle);
    expect(html).toContain(dictionary.profileIdentityChanged);
  });

  it("ignores unknown, repeated, or combined notice values", async () => {
    const dictionary = getDictionary("en");
    requireContext.mockResolvedValue({ dictionary, locale: "en", principal });
    getProfile.mockResolvedValue(profile);
    for (const query of [
      { identity: "unknown" },
      { identity: ["changed", "failed"] },
      { identity: "changed", password: "failed" },
      { password: "failed", extra: "value" },
    ]) {
      const html = renderToStaticMarkup(await ProfilePage({ searchParams: Promise.resolve(query) }));
      expect(html).not.toContain(dictionary.profileIdentityChanged);
      expect(html).not.toContain(dictionary.profileIdentityConflict);
      expect(html).not.toContain(dictionary.profileIdentityFailed);
      expect(html).not.toContain(dictionary.profilePasswordFailed);
    }
  });
});
