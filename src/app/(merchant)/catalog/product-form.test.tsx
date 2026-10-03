// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";

import { ProductForm } from "./product-form";

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ showToast }));
vi.mock("@/components/ui/modal", () => ({
  Modal: ({ open, children, footer, title }: { open: boolean; children: ReactNode; footer: ReactNode; title: string }) =>
    open ? <div role="dialog" aria-label={title}>{children}{footer}</div> : null,
}));
vi.mock("@/components/ui/image-uploader", () => ({
  ImageUploader: ({ onChange }: { onChange: (id: string) => void }) =>
    <button onClick={() => onChange("staged-image")} type="button">Stage image</button>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  showToast.mockReset();
  window.sessionStorage.clear();
});

function hidden(name: string): HTMLInputElement | null {
  return document.querySelector(`input[type="hidden"][name="${name}"]`);
}

function submitProduct() {
  const form = document.querySelector('form[action="/products"]') as HTMLFormElement;
  form.addEventListener("submit", (event) => event.preventDefault(), { once: true });
  fireEvent.submit(form);
}

describe("product registration form", () => {
  it.each([["en", en], ["pt-BR", ptBR]] as const)("copies only missing localized fields and submits exact BRL money in %s", async (_locale, dictionary) => {
    const user = userEvent.setup();
    render(<ProductForm categories={[]} choices={[]} dictionary={dictionary} formId="product-create" locale="en" />);
    fireEvent.change(screen.getByRole("textbox", { name: dictionary.adminProductInternalName }), { target: { value: "Course" } });
    const titleTabs = within(screen.getByRole("tablist", { name: dictionary.catalogProductTitleGroupLabel }));
    await user.click(titleTabs.getByRole("tab", { name: "EN" }));
    expect(titleTabs.getByRole("tab", { name: "EN" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: dictionary.adminProductTitleEn }), { target: { value: "English title" } });
    const descriptionTabs = within(screen.getByRole("tablist", { name: dictionary.catalogProductDescriptionGroupLabel }));
    await user.click(descriptionTabs.getByRole("tab", { name: "EN" }));
    expect(descriptionTabs.getByRole("tab", { name: "EN" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: dictionary.adminProductDescriptionEn }), { target: { value: "English description" } });
    const money = screen.getByRole("textbox", { name: dictionary.adminProductPrice });
    expect(money.getAttribute("name")).toBeNull();
    expect(money.getAttribute("placeholder")).toBe("R$ 0,00");
    fireEvent.change(money, { target: { value: "R$ 0,000001" } });
    expect(hidden("price")?.value).toBe("0.000001");
    submitProduct();
    expect(hidden("titlePtBr")?.value).toBe("English title");
    expect(hidden("titleEn")?.value).toBe("English title");
    expect(hidden("descriptionPtBr")?.value).toBe("English description");
    expect(hidden("descriptionEn")?.value).toBe("English description");
    expect(showToast).not.toHaveBeenCalled();
  });

  it("keeps nonblank translations, blocks missing titles and overlong values without toasting", async () => {
    const user = userEvent.setup();
    render(<ProductForm categories={[]} choices={[]} dictionary={en} formId="product-create" locale="en" />);
    fireEvent.change(screen.getByRole("textbox", { name: en.adminProductInternalName }), { target: { value: "X".repeat(129) } });
    expect((screen.getByRole("textbox", { name: en.adminProductInternalName }) as HTMLInputElement).value).toBe("");
    submitProduct();
    expect(screen.getAllByText(en.catalogProductTitleRequired).length).toBeGreaterThan(0);
    expect(screen.getAllByText(en.catalogProductDescriptionRequired).length).toBeGreaterThan(0);
    expect(showToast).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: en.adminProductInternalName }), { target: { value: "Name" } });
    fireEvent.change(screen.getByRole("textbox", { name: en.adminProductTitlePtBr }), { target: { value: "Português" } });
    const titleTabs = within(screen.getByRole("tablist", { name: en.catalogProductTitleGroupLabel }));
    await user.click(titleTabs.getByRole("tab", { name: /^EN(?:,|$)/ }));
    expect(titleTabs.getByRole("tab", { name: /^EN(?:,|$)/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: en.adminProductTitleEn }), { target: { value: "English" } });
    fireEvent.change(screen.getByRole("textbox", { name: en.adminProductTitleEn }), { target: { value: "😀".repeat(161) } });
    expect(hidden("titleEn")?.value).toBe("English");
    expect(hidden("titlePtBr")?.value).toBe("Português");
    const descriptionTabs = within(screen.getByRole("tablist", { name: en.catalogProductDescriptionGroupLabel }));
    await user.click(descriptionTabs.getByRole("tab", { name: /^EN(?:,|$)/ }));
    expect(descriptionTabs.getByRole("tab", { name: /^EN(?:,|$)/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: en.adminProductDescriptionEn }), { target: { value: "😀".repeat(2_001) } });
    expect(hidden("descriptionEn")?.value).toBe("");
  });

  it("copies a supplied Portuguese edit into blank English only, preserving nonblank English descriptions", () => {
    const product = {
      id: "550e8400-e29b-41d4-a716-446655440000", internalName: "Course",
      titlePtBr: "Curso", titleEn: "", descriptionPtBr: "Descrição", descriptionEn: "English notes",
      price: "1234.5", active: true, categoryId: null, currencyCode: null, imageMediaId: null,
      archivedAt: null, version: 3, createdAt: new Date(), updatedAt: new Date(),
    };
    render(<ProductForm categories={[]} choices={[]} dictionary={en} formId="product-edit" locale="en" product={product} />);
    expect((screen.getByRole("textbox", { name: en.adminProductPrice }) as HTMLInputElement).value).toBe("R$ 1.234,50");
    submitProduct();
    expect(hidden("titleEn")?.value).toBe("Curso");
    expect(hidden("descriptionEn")?.value).toBe("English notes");
    expect(hidden("descriptionPtBr")?.value).toBe("Descrição");
    expect(hidden("price")?.value).toBe("1234.5");
    expect(hidden("categoryId")).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("creates and selects a category without leaving the form or losing text, price, image and draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "550e8400-e29b-41d4-a716-446655440000", namePtBr: "Cursos", nameEn: "Courses",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProductForm categories={[]} choices={[]} dictionary={en} formId="product-create" locale="en" />);
    fireEvent.change(screen.getByRole("textbox", { name: en.adminProductInternalName }), { target: { value: "My course" } });
    fireEvent.change(screen.getByRole("textbox", { name: en.adminProductTitlePtBr }), { target: { value: "Curso" } });
    fireEvent.change(screen.getByRole("textbox", { name: en.adminProductPrice }), { target: { value: "R$ 12,34" } });
    fireEvent.click(screen.getByRole("button", { name: "Stage image" }));
    fireEvent.click(screen.getByRole("button", { name: en.catalogProductCategoryCreateInline }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByRole("textbox", { name: en.catalogCategoryNamePtBr }), { target: { value: "😀".repeat(161) } });
    expect((within(modal).getByRole("textbox", { name: en.catalogCategoryNamePtBr }) as HTMLInputElement).value).toBe("");
    fireEvent.change(within(modal).getByRole("textbox", { name: en.catalogCategoryNamePtBr }), { target: { value: "Cursos" } });
    fireEvent.change(within(modal).getByRole("textbox", { name: en.catalogCategoryNameEn }), { target: { value: "Courses" } });
    fireEvent.submit(modal.querySelector("form")!);
    await waitFor(() => expect(hidden("categoryId")?.value).toBe("550e8400-e29b-41d4-a716-446655440000"));
    expect((screen.getByRole("combobox", { name: en.catalogProductCategoryLabel }) as HTMLSelectElement).value).toBe(hidden("categoryId")?.value);
    expect(hidden("imageMediaId")?.value).toBe("staged-image");
    expect(hidden("internalName")?.value).toBe("My course");
    expect(hidden("titlePtBr")?.value).toBe("Curso");
    expect(hidden("price")?.value).toBe("12.34");
    expect(fetchMock).toHaveBeenCalledWith("/product-categories", expect.objectContaining({ method: "POST", headers: { Accept: "application/json" } }));
    expect(showToast).not.toHaveBeenCalled();
  });

  it("keeps the modal and product data when an opaque category request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ outcome: "conflict" }), { status: 409 })));
    render(<ProductForm categories={[]} choices={[]} dictionary={ptBR} formId="product-create" locale="pt-BR" />);
    fireEvent.change(screen.getByRole("textbox", { name: ptBR.adminProductInternalName }), { target: { value: "Produto" } });
    fireEvent.click(screen.getByRole("button", { name: ptBR.catalogProductCategoryCreateInline }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByRole("textbox", { name: ptBR.catalogCategoryNamePtBr }), { target: { value: "Cursos" } });
    fireEvent.change(within(modal).getByRole("textbox", { name: ptBR.catalogCategoryNameEn }), { target: { value: "Courses" } });
    fireEvent.submit(modal.querySelector("form")!);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith({ kind: "error", message: ptBR.catalogCategoryMutationFailed }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(hidden("internalName")?.value).toBe("Produto");
    expect(hidden("categoryId")).toBeNull();
  });
});
