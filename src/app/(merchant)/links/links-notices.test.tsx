import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";

import { PaymentLinkV2Notice } from "./links-notices";

const dictionary = getDictionary("en");

describe("PaymentLinkV2Notice", () => {
  it("keeps a status noscript Alert in sync with the success toast kind", () => {
    const markup = renderToStaticMarkup(<PaymentLinkV2Notice dictionary={dictionary} notice="created" />);
    expect(markup).toContain("<noscript");
    expect(markup).toContain(dictionary.paymentLinkNoticeCreated);
    expect(markup).toMatch(/role="status"/);
  });

  it("keeps an alert noscript Alert in sync with the single opaque failure", () => {
    const markup = renderToStaticMarkup(<PaymentLinkV2Notice dictionary={dictionary} notice="failed" />);
    expect(markup).toContain(dictionary.paymentLinkNoticeFailed);
    expect(markup).toMatch(/role="alert"/);
  });
});
