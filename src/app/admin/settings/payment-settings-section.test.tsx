// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";

const { useSearchParams } = vi.hoisted(() => ({ useSearchParams: vi.fn(() => new URLSearchParams()) }));
vi.mock("next/navigation", () => ({ useSearchParams }));

import { PaymentSettingsSection } from "./payment-settings-section";

class PaymentSettingsResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}
globalThis.ResizeObserver = PaymentSettingsResizeObserver;

afterEach(cleanup);

describe("payment settings section", () => {
  it("gates turning a row off behind the destructive confirm, applying only on confirm", () => {
    render(
      <PaymentSettingsSection
        dictionary={dictionary}
        notice={null}
        settings={{ currencies: ["BRL"], paymentMethods: ["PIX"] }}
      />,
    );

    expect(document.querySelector('input[name="currencies"][value="BRL"]')).not.toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: dictionary.adminCurrencyBRL }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).not.toBeNull();
    expect(screen.getByText(dictionary.adminConfirmDeactivateTitle)).not.toBeNull();
    expect(screen.getByText(dictionary.adminConfirmDeactivateBody)).not.toBeNull();

    // Turning a row on stays reversible and needs no confirm.
    expect(document.querySelector('input[name="currencies"][value="BRL"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: dictionary.adminDeactivate }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.querySelector('input[name="currencies"][value="BRL"]')).toBeNull();
  });
});
