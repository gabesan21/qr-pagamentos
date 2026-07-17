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
    expect(unavailable).toContain('href="/"');
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
});
