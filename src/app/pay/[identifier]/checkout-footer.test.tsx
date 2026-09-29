// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";

import { CheckoutFooter } from "./checkout-footer";

describe("checkout footer", () => {
  it("renders the powered-by copy, the language switcher bound to the current locale, and the privacy notice trigger", () => {
    const markup = renderToStaticMarkup(<CheckoutFooter dictionary={dictionary} locale="en" />);
    expect(markup).toContain(dictionary.checkoutPoweredBy);
    expect(markup).toContain('action="/language-preference"');
    expect(markup).toContain('name="locale"');
    expect(markup).toContain('aria-label="English"');
    expect(markup).toContain(dictionary.checkoutPrivacyLine);
  });

  it("selects the persisted locale option, not always the first one", () => {
    const markup = renderToStaticMarkup(<CheckoutFooter dictionary={dictionary} locale="pt-BR" />);
    expect(markup).toContain('aria-label="Português (Brasil)"');
  });

  it("can hide only the shared privacy statement while retaining its modal action", () => {
    const markup = renderToStaticMarkup(<CheckoutFooter dictionary={dictionary} hidePrivacyStatement locale="en" />);

    expect(markup).not.toContain(dictionary.checkoutPrivacyLine);
    expect(markup).toContain(dictionary.checkoutPrivacyLinkLabel);
  });
});
