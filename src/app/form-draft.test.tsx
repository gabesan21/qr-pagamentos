// @vitest-environment jsdom

import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearFormDraft,
  FormDraftGuard,
  hasFailureNotice,
  readFormDraft,
  saveFormDraft,
} from "./form-draft";

afterEach(cleanup);

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/catalog/products/new");
});

describe("form draft persistence", () => {
  it("round-trips a saved draft and clears it", () => {
    expect(readFormDraft("product-create")).toBeNull();
    saveFormDraft("product-create", { internalName: "Espresso" });
    expect(readFormDraft("product-create")).toEqual({ internalName: "Espresso" });
    clearFormDraft("product-create");
    expect(readFormDraft("product-create")).toBeNull();
  });

  it("returns null for malformed stored JSON instead of throwing", () => {
    window.sessionStorage.setItem("qr-form-draft:product-create", "not-json");
    expect(readFormDraft("product-create")).toBeNull();
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

describe("FormDraftGuard", () => {
  function Harness({ draftKey = "product-create" }: { draftKey?: string }) {
    return (
      <form id="product-form">
        <input defaultValue="" name="internalName" />
        <FormDraftGuard
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

    expect(readFormDraft("product-create")).toEqual({ internalName: "Corn cake" });
  });

  it("restores the draft into the form only under the failure notice", () => {
    saveFormDraft("product-create", { internalName: "Corn cake" });
    window.history.pushState({}, "", "/catalog/products/new?products=failed");

    const { container } = render(<Harness />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("Corn cake");
  });

  it("clears a stale draft on a load without the failure notice", () => {
    saveFormDraft("product-create", { internalName: "Corn cake" });
    window.history.pushState({}, "", "/catalog/products/new");

    const { container } = render(<Harness />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(readFormDraft("product-create")).toBeNull();
  });
});
