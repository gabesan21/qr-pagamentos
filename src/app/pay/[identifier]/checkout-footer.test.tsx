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
    expect(markup).toContain('value="en" selected=""');
    expect(markup).toContain(dictionary.checkoutPrivacyLine);
  });

  it("selects the persisted locale option, not always the first one", () => {
    const markup = renderToStaticMarkup(<CheckoutFooter dictionary={dictionary} locale="pt-BR" />);
    expect(markup).toContain('value="pt-BR" selected=""');
  });
});
