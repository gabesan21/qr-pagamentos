import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";
import type { OwnerNauttStatus } from "@/integrations/nautt/owner-onboarding";
import { NauttCredentialSurface } from "./nautt-credential-surface";

const emptyCredential = { hasCredential: false, credentialRevision: null, webhookRegistrationState: null, updatedAt: null };

function markup(locale: "en" | "pt-BR", status: OwnerNauttStatus, notice?: string) {
  return renderToStaticMarkup(<NauttCredentialSurface dictionary={getDictionary(locale)} notice={notice} status={status} />);
}

describe("Nautt credential surface", () => {
  it.each(["en", "pt-BR"] as const)("renders a labelled secret onboarding form without echoing a key in %s", (locale) => {
    const html = markup(locale, { credential: emptyCredential, balance: null, balanceUnavailable: false }, "invalid");
    expect(html).toContain('type="password"');
    expect(html).toContain('name="apiKey"');
    expect(html).toContain('for="nautt-api-key"');
    expect(html).toContain('action="/nautt-credentials"');
    expect(html).toContain('form="nautt-credential-form"');
    expect(html).not.toContain(locale === "en" ? "Connecting account" : "Conectando conta");
    expect(html).not.toContain("private-key");
  });

  it.each(["en", "pt-BR"] as const)("renders configured wallet facts and manual unavailable retry in %s", (locale) => {
    const credential = { ...emptyCredential, hasCredential: true, credentialRevision: "revision", webhookRegistrationState: "ACTIVE" as const, updatedAt: new Date() };
    const available = markup(locale, { credential, balance: { tokenSymbol: "USDT", tokenName: "Tether USD", networkName: "Polygon", balance: "17.271189" }, balanceUnavailable: false });
    expect(available).toContain("17.271189"); expect(available).toContain("Polygon");
    const unavailable = markup(locale, { credential, balance: null, balanceUnavailable: true });
    expect(unavailable).toContain('href="/settings"');
  });

  it.each(["UNREGISTERED", "REGISTERING", "INDETERMINATE"] as const)("renders the safe %s registration fork", (state) => {
    const html = markup("en", { credential: { ...emptyCredential, hasCredential: true, credentialRevision: "revision", webhookRegistrationState: state, updatedAt: new Date() }, balance: null, balanceUnavailable: true });
    if (state === "UNREGISTERED") {
      expect(html).toContain('action="/nautt-credentials/register"');
      expect(html).toContain('form="nautt-registration-form"');
    }
    else expect(html).not.toContain('action="/nautt-credentials/register"');
    expect(html).not.toContain("revision");
  });

  it.each(["en", "pt-BR"] as const)("shows the local-only reset affordance with disclosure only in stuck states in %s", (locale) => {
    const dictionary = getDictionary(locale);
    for (const state of ["REGISTERING", "INDETERMINATE"] as const) {
      const html = markup(locale, { credential: { ...emptyCredential, hasCredential: true, credentialRevision: "revision", webhookRegistrationState: state, updatedAt: new Date() }, balance: null, balanceUnavailable: true }, "recovery");
      expect(html).toContain('action="/nautt-credentials/reset"');
      expect(html).toContain('form="nautt-reset-form"');
      expect(html).toContain(dictionary.nauttResetDisclosure);
      expect(html).toContain(dictionary.nauttReset);
    }
    for (const state of ["UNREGISTERED", "ACTIVE"] as const) {
      const html = markup(locale, { credential: { ...emptyCredential, hasCredential: true, credentialRevision: "revision", webhookRegistrationState: state, updatedAt: new Date() }, balance: null, balanceUnavailable: true });
      expect(html).not.toContain('action="/nautt-credentials/reset"');
      expect(html).not.toContain(dictionary.nauttResetDisclosure);
    }
  });

  it.each(["en", "pt-BR"] as const)("renders the post-reset success notice in %s", (locale) => {
    const dictionary = getDictionary(locale);
    const credential = { ...emptyCredential, hasCredential: true, credentialRevision: "revision", webhookRegistrationState: "UNREGISTERED" as const, updatedAt: new Date() };
    const html = markup(locale, { credential, balance: null, balanceUnavailable: true }, "reset");
    expect(html).toContain('role="status"');
    expect(html).toContain(dictionary.nauttResetDone);
    expect(html).toContain('action="/nautt-credentials/register"');
  });
});
