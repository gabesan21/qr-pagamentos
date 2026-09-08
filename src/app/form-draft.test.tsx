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
        <textarea defaultValue="" name="description" />
        <select defaultValue="" name="category">
          <option value="">Select…</option>
          <option value="drinks">Drinks</option>
          <option value="food">Food</option>
        </select>
        <FormDraftGuard
          draftKey={draftKey}
          fieldNames={["internalName", "description", "category"]}
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

    expect(readFormDraft("product-create")).toMatchObject({ internalName: "Corn cake" });
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

  it("round-trips a textarea value through save and restore", () => {
    const { container, unmount } = render(<Harness />);
    const form = container.querySelector("form") as HTMLFormElement;
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "Long comment body";

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(readFormDraft("product-create")).toMatchObject({ description: "Long comment body" });

    unmount();
    window.history.pushState({}, "", "/catalog/products/new?products=failed");
    const { container: restored } = render(<Harness />);
    const restoredTextarea = restored.querySelector("textarea") as HTMLTextAreaElement;
    expect(restoredTextarea.value).toBe("Long comment body");
  });

  it("round-trips a select value through save and restore", () => {
    const { container, unmount } = render(<Harness />);
    const form = container.querySelector("form") as HTMLFormElement;
    const select = container.querySelector("select") as HTMLSelectElement;
    select.value = "drinks";

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(readFormDraft("product-create")).toMatchObject({ category: "drinks" });

    unmount();
    window.history.pushState({}, "", "/catalog/products/new?products=failed");
    const { container: restored } = render(<Harness />);
    const restoredSelect = restored.querySelector("select") as HTMLSelectElement;
    expect(restoredSelect.value).toBe("drinks");
  });
});
