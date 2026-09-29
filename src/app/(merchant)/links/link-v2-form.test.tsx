// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";

import { linkV2FormCopy } from "./link-v2-form-copy";
import { LinkV2Form, type LinkV2FormPair } from "./link-v2-form";

const dictionary = en;
const copy = linkV2FormCopy(dictionary, "Create payment link");

const BRL_PAIR: LinkV2FormPair = { id: "pair-brl", label: "BRL/USDT", currencyCode: "BRL" };
const USD_PAIR: LinkV2FormPair = { id: "pair-usd", label: "USD/USDT", currencyCode: "USD" };
const PRODUCT_ID = "440e8400-e29b-41d4-a716-446655440030";

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Sao_Paulo";
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function hiddenAmount(): HTMLInputElement | null {
  return document.querySelector('input[type="hidden"][name="amount"]');
}

function hiddenExpiry(): HTMLInputElement | null {
  return document.querySelector('input[type="hidden"][name="expiresAt"]');
}

function pairSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: dictionary.adminPaymentLinkCurrencyPair }) as HTMLSelectElement;
}

function amountTextbox(): HTMLInputElement {
  return screen.getByRole("textbox", { name: dictionary.paymentLinkDirectoryAmount }) as HTMLInputElement;
}

function expiryInput(): HTMLInputElement {
  return document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
}

afterEach(cleanup);

describe("merchant V2 link form — currency mask and canonical submit", () => {
  it("masks the fixed amount only when the selected pair's code is BRL", () => {
    render(
      <LinkV2Form action="/payment-links-v2" copy={copy} formId="create" initialKind="FIXED_AMOUNT" locale="en" mode="create" pairs={[USD_PAIR, BRL_PAIR]} products={[]} />,
    );

    fireEvent.change(pairSelect(), { target: { value: USD_PAIR.id } });
    expect(amountTextbox().getAttribute("name")).toBe("amount");

    fireEvent.change(pairSelect(), { target: { value: BRL_PAIR.id } });
    expect(amountTextbox().getAttribute("name")).toBeNull();
    expect(hiddenAmount()?.value).toBe("");
  });

  it("posts the canonical exact decimal through the hidden amount on create", () => {
    render(
      <LinkV2Form action="/payment-links-v2" copy={copy} formId="create" initialKind="FIXED_AMOUNT" locale="en" mode="create" pairs={[BRL_PAIR]} products={[]} />,
    );

    fireEvent.change(pairSelect(), { target: { value: BRL_PAIR.id } });
    const amount = amountTextbox();
    for (const key of "1050") fireEvent.keyDown(amount, { key });

    expect(amount.value).toBe("R$ 10,50");
    expect(hiddenAmount()?.value).toBe("10.5");
    expect(screen.getByText("R$ 10,50")).toBeTruthy();
  });

  it("keeps the plain input and renders other currency codes without a symbol", () => {
    render(
      <LinkV2Form action="/payment-links-v2" copy={copy} formId="create" initialKind="FIXED_AMOUNT" locale="en" mode="create" pairs={[USD_PAIR]} products={[]} />,
    );

    fireEvent.change(pairSelect(), { target: { value: USD_PAIR.id } });
    const amount = amountTextbox();
    fireEvent.change(amount, { target: { value: "12.5" } });

    expect(amount.value).toBe("12.5");
    expect(screen.getByText("12.5 USD")).toBeTruthy();
  });

  it("omits the hidden amount until dirty on edit and posts it once changed", () => {
    render(
      <LinkV2Form action="/payment-links-v2/link-id" copy={copy} currencyCode="BRL" currencyPairLabel="BRL/USDT" formId="edit" initialAmount="10.5" initialKind="FIXED_AMOUNT" locale="en" mode="edit" pairs={[]} products={[]} version={5} />,
    );

    expect(hiddenAmount()).toBeNull();
    const amount = amountTextbox();
    expect(amount.value).toBe("R$ 10,50");

    fireEvent.change(amount, { target: { value: "R$ 20,00" } });
    expect(hiddenAmount()?.value).toBe("20");

    const version = document.querySelector('input[name="version"]') as HTMLInputElement;
    expect(version.value).toBe("5");
  });
});

describe("merchant V2 link form — browser-local expiry", () => {
  it("converts the stored instant post-mount, stays absent untouched, and posts UTC once changed", async () => {
    render(
      <LinkV2Form action="/payment-links-v2/link-id" copy={copy} currencyCode={null} formId="edit" initialExpiresAt="2027-08-01T15:30:00.000Z" locale="en" mode="edit" pairs={[]} products={[]} version={1} />,
    );

    await waitFor(() => expect(expiryInput().value).toBe("2027-08-01T12:30"));
    expect(hiddenExpiry()).toBeNull();

    fireEvent.change(expiryInput(), { target: { value: "2027-08-02T09:00" } });
    expect(hiddenExpiry()?.value).toBe("2027-08-02T12:00");
  });

  it("posts an empty expiry when the merchant clears it", async () => {
    render(
      <LinkV2Form action="/payment-links-v2/link-id" copy={copy} currencyCode={null} formId="edit" initialExpiresAt="2027-08-01T15:30:00.000Z" locale="en" mode="edit" pairs={[]} products={[]} version={1} />,
    );

    await waitFor(() => expect(expiryInput().value).toBe("2027-08-01T12:30"));
    fireEvent.click(screen.getByRole("button", { name: dictionary.paymentLinksFormExpiryClear }));

    expect(hiddenExpiry()?.value).toBe("");
    expect(expiryInput().value).toBe("");
  });

  it("keeps the visible expiry control unnamed on create while the hidden field posts", () => {
    render(
      <LinkV2Form action="/payment-links-v2" copy={copy} formId="create" initialKind="FIXED_AMOUNT" locale="en" mode="create" pairs={[]} products={[]} />,
    );

    expect(expiryInput().getAttribute("name")).toBeNull();
    expect(hiddenExpiry()?.value).toBe("");
  });
});

describe("merchant V2 link form — preview per composition kind", () => {
  it("previews the fixed amount in BRL", () => {
    render(
      <LinkV2Form action="/payment-links-v2" copy={copy} formId="create" initialAmount="10.5" initialKind="FIXED_AMOUNT" locale="en" mode="create" pairs={[BRL_PAIR]} products={[]} />,
    );

    fireEvent.change(pairSelect(), { target: { value: BRL_PAIR.id } });
    expect(screen.getByText("R$ 10,50")).toBeTruthy();
  });

  it("previews the product-lines running total in BRL", () => {
    render(
      <LinkV2Form
        action="/payment-links-v2"
        copy={copy}
        formId="create"
        initialKind="PRODUCT_LINES"
        initialLines={[{ available: true, productId: PRODUCT_ID, quantity: 1, titleEn: "Espresso shot", titlePtBr: "Café expresso", unitPrice: "10" }]}
        locale="en"
        mode="create"
        pairs={[BRL_PAIR]}
        products={[{ id: PRODUCT_ID, price: "10", titleEn: "Espresso shot", titlePtBr: "Café expresso" }]}
      />,
    );

    fireEvent.change(pairSelect(), { target: { value: BRL_PAIR.id } });
    expect(screen.getByText("R$ 10,00")).toBeTruthy();
  });
});
