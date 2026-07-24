import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";

import { ProfileManagement, type ProfileNotice } from "./profile-management";

const profile = { username: "merchant.user", email: "contact@example.com", version: 7 };

describe("profile management composition", () => {
  it.each(["en", "pt-BR"] as const)("renders bilingual native identity and password forms in %s", (locale) => {
    const dictionary = getDictionary(locale);
    const html = renderToStaticMarkup(<ProfileManagement dictionary={dictionary} notice={null} profile={profile} />);
    expect(html).toContain('action="/profile/identity"');
    expect(html).toContain('action="/profile/password"');
    expect(html).toContain('type="hidden" name="expectedVersion" value="7"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(html).toContain(dictionary.profileIdentityTitle);
    expect(html).toContain(dictionary.profilePasswordTitle);
    expect(html).not.toMatch(/passwordHash|credentialRevision|ownerId/);
  });

  it("renders only the closed localized notices", () => {
    const dictionary = getDictionary("en");
    const cases: Array<[ProfileNotice, string]> = [
      ["identity-changed", dictionary.profileIdentityChanged],
      ["identity-conflict", dictionary.profileIdentityConflict],
      ["identity-failed", dictionary.profileIdentityFailed],
      ["password-failed", dictionary.profilePasswordFailed],
    ];
    for (const [notice, copy] of cases) {
      const html = renderToStaticMarkup(<ProfileManagement dictionary={dictionary} notice={notice} profile={profile} />);
      expect(html).toContain(copy);
    }
  });

  it("keeps native controls enabled before submission", () => {
    const html = renderToStaticMarkup(<ProfileManagement dictionary={getDictionary("en")} notice={null} profile={profile} />);
    expect(html).not.toContain('aria-busy="true"');
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('data-slot="spinner"');
  });
});
