// @vitest-environment jsdom

import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CatalogDraftGuard,
  clearCatalogDraft,
  hasFailureNotice,
  readCatalogDraft,
  saveCatalogDraft,
} from "./catalog-draft";

afterEach(cleanup);

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/catalog/products/new");
});

describe("catalog draft persistence", () => {
  it("round-trips a saved draft and clears it", () => {
    expect(readCatalogDraft("product-create")).toBeNull();
    saveCatalogDraft("product-create", { internalName: "Espresso" });
    expect(readCatalogDraft("product-create")).toEqual({ internalName: "Espresso" });
    clearCatalogDraft("product-create");
    expect(readCatalogDraft("product-create")).toBeNull();
  });

  it("returns null for malformed stored JSON instead of throwing", () => {
    window.sessionStorage.setItem("qr-catalog-draft:product-create", "not-json");
    expect(readCatalogDraft("product-create")).toBeNull();
  });
});

describe("hasFailureNotice", () => {
  it("matches only a listed value on the current query", () => {
    window.history.pushState({}, "", "/catalog/products/new?products=failed");
    expect(hasFailureNotice("products", ["conflict", "failed"])).toBe(true);

    window.history.pushState({}, "", "/catalog/products/new?products=create");
    expect(hasFailureNotice("products", ["conflict", "failed"])).toBe(false);

    window.history.pushState({}, "", "/catalog/products/new");
    expect(hasFailureNotice("products", ["conflict", "failed"])).toBe(false);
  });
});

describe("CatalogDraftGuard", () => {
  function Harness({ draftKey = "product-create" }: { draftKey?: string }) {
    return (
      <form id="product-form">
        <input defaultValue="" name="internalName" />
        <CatalogDraftGuard
          draftKey={draftKey}
          fieldNames={["internalName"]}
          formId="product-form"
          noticeKey="products"
          noticeValues={["conflict", "failed"]}
        />
      </form>
    );
  }

  it("saves the typed values into the session draft on submit", () => {
    const { container } = render(<Harness />);
    const form = container.querySelector("form") as HTMLFormElement;
    const input = container.querySelector("input") as HTMLInputElement;
    input.value = "Corn cake";

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(readCatalogDraft("product-create")).toEqual({ internalName: "Corn cake" });
  });

  it("restores the draft into the form only under the failure notice", () => {
    saveCatalogDraft("product-create", { internalName: "Corn cake" });
    window.history.pushState({}, "", "/catalog/products/new?products=failed");

    const { container } = render(<Harness />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("Corn cake");
  });

  it("clears a stale draft on a load without the failure notice", () => {
    saveCatalogDraft("product-create", { internalName: "Corn cake" });
    window.history.pushState({}, "", "/catalog/products/new");

    const { container } = render(<Harness />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(readCatalogDraft("product-create")).toBeNull();
  });
});
