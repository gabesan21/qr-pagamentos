import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";

import { CategoryNotice, ProductNotice } from "./catalog-notices";

const dictionary = getDictionary("en");

describe("ProductNotice", () => {
  it("keeps a status noscript Alert in sync with the success toast kind", () => {
    const markup = renderToStaticMarkup(<ProductNotice dictionary={dictionary} notice="saved" />);
    expect(markup).toContain("<noscript");
    expect(markup).toContain(dictionary.adminProductChanged);
    expect(markup).toMatch(/role="status"/);
  });

  it("keeps an alert noscript Alert in sync with the error toast kind", () => {
    const markup = renderToStaticMarkup(<ProductNotice dictionary={dictionary} notice="conflict" />);
    expect(markup).toContain(dictionary.adminProductConflict);
    expect(markup).toMatch(/role="alert"/);
  });
});

describe("CategoryNotice", () => {
  it("keeps a status noscript Alert in sync with the success toast kind", () => {
    const markup = renderToStaticMarkup(<CategoryNotice dictionary={dictionary} notice="saved" />);
    expect(markup).toContain(dictionary.catalogCategoryChanged);
    expect(markup).toMatch(/role="status"/);
  });

  it("keeps an alert noscript Alert in sync with the error toast kind", () => {
    const markup = renderToStaticMarkup(<CategoryNotice dictionary={dictionary} notice="failed" />);
    expect(markup).toContain(dictionary.catalogCategoryMutationFailed);
    expect(markup).toMatch(/role="alert"/);
  });
});
