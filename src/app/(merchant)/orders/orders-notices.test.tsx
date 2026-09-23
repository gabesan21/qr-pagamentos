import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";

import { OrderV2Notice } from "./orders-notices";

const dictionary = getDictionary("en");

describe("OrderV2Notice", () => {
  it("keeps a status noscript Alert in sync with the success toast kind", () => {
    const markup = renderToStaticMarkup(<OrderV2Notice dictionary={dictionary} notice="commented" />);
    expect(markup).toContain("<noscript");
    expect(markup).toContain(dictionary.orderV2NoticeCommented);
    expect(markup).toMatch(/role="status"/);
  });

  it("keeps an alert noscript Alert in sync with the single opaque failure", () => {
    const markup = renderToStaticMarkup(<OrderV2Notice dictionary={dictionary} notice="failed" />);
    expect(markup).toContain(dictionary.orderV2NoticeFailed);
    expect(markup).toMatch(/role="alert"/);
  });
});
