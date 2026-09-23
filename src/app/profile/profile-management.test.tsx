import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    expect(html).toContain(dictionary.profilePasswordLengthMeter.replace("{{len}}", "0"));
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

  it("renders the TOTP card when a status is provided", () => {
    const dictionary = getDictionary("en");
    const html = renderToStaticMarkup(<ProfileManagement dictionary={dictionary} notice={null} profile={profile} totpStatus="none" />);
    expect(html).toContain(dictionary.profileTotpTitle);
    expect(html).toContain(dictionary.profileTotpEnroll);
  });

  it("keeps native controls enabled before submission, except the dirty-gated identity save", () => {
    const html = renderToStaticMarkup(<ProfileManagement dictionary={getDictionary("en")} notice={null} profile={profile} />);
    expect(html).not.toContain('aria-busy="true"');
    expect(html).not.toContain('data-slot="spinner"');
    // The identity form's save button starts disabled until a field is
    // dirty (`ProfileFormBody`'s `disableSubmit`); the password form's own
    // submit carries no such gate and stays enabled.
    expect(html).toContain('disabled="" type="submit"><span aria-live="polite">Save identity</span>');
    expect(html).toContain('type="submit"><span aria-live="polite">Change password</span>');
    expect(html).not.toContain('disabled="" type="submit"><span aria-live="polite">Change password</span>');
  });

  it("observes native submission without replacing browser POST navigation", () => {
    const source = readFileSync(join(import.meta.dirname, "profile-form.tsx"), "utf8");

    expect(source).toContain('addEventListener("submit"');
    expect(source).toContain('addEventListener("formdata"');
    // Matches an actual interception call, not the defensive-check comment
    // above the listener that merely mentions a sibling field's own
    // `preventDefault()` call in prose.
    expect(source).not.toMatch(/\.preventDefault\(|\.requestSubmit\(|fetch\s*\(/);
  });
});
