// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { designSystemEn } from "@/i18n/dictionaries/design-system/en";
import { en } from "@/i18n/dictionaries/en";

import { designSystemCoverage, primitiveBindingId, primitiveCoverage } from "./coverage";
import { DesignSystemInteractiveSpecimens } from "./interactive-specimens";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "en" }) }) }));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ addEventListener: vi.fn(), matches: false, removeEventListener: vi.fn() })) });
  Object.defineProperty(window, "ResizeObserver", { configurable: true, value: class { disconnect() {} observe() {} unobserve() {} } });
});

afterEach(() => cleanup());

describe("mounted design-system state probes", () => {
  it("mounts every interactive binding on a real, visible fixture target", () => {
    const { container } = render(<DesignSystemInteractiveSpecimens dictionary={designSystemEn} />);
    const interactiveOwners = new Set(["button", "checkbox", "input-otp", "switch", "copy-field", "localized-field-group", "modal", "simple-tabs", "toast"]);
    const bindings = designSystemCoverage.flatMap((entry) => interactiveOwners.has(entry.id) ? entry.bindings : []);

    expect(bindings).toHaveLength(52);
    for (const binding of bindings) {
      const target = container.querySelector(binding.selector);
      expect(target, binding.id).not.toBeNull();
      expect(target?.children.length, binding.id).toBeGreaterThan(0);
      expect(target?.closest(".sr-only"), binding.id).toBeNull();
    }
  });

  it("operates unavailable, invalid, keyboard, overlay, and deterministic toast states", async () => {
    const user = userEvent.setup();
    const { container } = render(<DesignSystemInteractiveSpecimens dictionary={designSystemEn} />);

    expect((within(container.querySelector("#ds-button-loading")!).getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(within(container.querySelector("#ds-button-loading")!).getByRole("button").getAttribute("aria-busy")).toBe("true");
    expect(within(container.querySelector("#ds-checkbox-invalid")!).getByRole("checkbox").getAttribute("aria-invalid")).toBe("true");
    expect((within(container.querySelector("#ds-checkbox-disabled")!).getByRole("checkbox") as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector("#ds-input-otp-invalid [aria-invalid=true]")).not.toBeNull();
    expect((container.querySelector("#ds-input-otp-disabled input") as HTMLInputElement).disabled).toBe(true);

    const focusButton = within(container.querySelector("#ds-button-focus")!).getByRole("button");
    focusButton.focus();
    expect(document.activeElement).toBe(focusButton);

    await user.click(within(container.querySelector("#ds-modal-open")!).getByRole("button"));
    expect(await screen.findByRole("dialog", { name: designSystemEn.designSystemModalTitle })).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: designSystemEn.designSystemModalTitle })).toBeNull());

    await user.click(within(container.querySelector("#ds-toast-info")!).getByRole("button"));
    await waitFor(() => expect(document.querySelector("[data-sonner-toast]")).not.toBeNull());
    fireEvent.click(container.querySelector("[data-probe-reset]")!);
    await waitFor(() => expect(document.querySelector("[data-sonner-toast]")).toBeNull());
  });

  it("mounts every static owner/state and all remaining primitive bindings", async () => {
    vi.doMock("@/i18n/dictionaries", () => ({ getDictionary: () => en }));
    const { default: DesignSystemPage } = await import("./page");
    const { container } = render(await DesignSystemPage());
    const staticOwners = new Set(["data-directory-table", "empty-state", "data-directory-filter", "money-text", "monogram", "qr-display", "skeletons", "stat-card", "status-badge", "timeline", "pagination"]);
    const bindings = designSystemCoverage.flatMap((entry) => staticOwners.has(entry.id) ? entry.bindings : []);

    expect(bindings).toHaveLength(49);
    for (const binding of bindings) {
      const target = container.querySelector(binding.selector);
      expect(target, binding.id).not.toBeNull();
      expect(target?.children.length, binding.id).toBeGreaterThan(0);
      expect(target?.closest(".sr-only"), binding.id).toBeNull();
    }
    for (const primitive of primitiveCoverage) {
      expect(container.querySelector(`#${primitiveBindingId(primitive)}`), primitive).not.toBeNull();
    }
    expect(container.querySelector("#ds-qr-display-preparing [aria-busy=true]")).not.toBeNull();
    expect(container.querySelector("#ds-stat-card-empty")?.textContent).toContain("0");
    expect(container.querySelector("#ds-stat-card-unavailable")?.textContent).toContain("—");
    expect(container.querySelector("#ds-timeline-empty ol")?.children).toHaveLength(0);
    expect(container.querySelector("#ds-primitive-textarea") instanceof HTMLTextAreaElement).toBe(true);
  });

  it("binds all 23 primitive targets to mounted shared primitives", () => {
    const { container } = render(<DesignSystemInteractiveSpecimens dictionary={designSystemEn} />);
    const interactivePrimitives = primitiveCoverage.filter((primitive) => container.querySelector(`#${primitiveBindingId(primitive)}`));
    expect(interactivePrimitives).toEqual(expect.arrayContaining(["AlertDialog", "Button", "Checkbox", "Dialog", "Field", "Input", "InputOTP", "Label", "NativeSelect", "Sonner", "Switch", "Tabs", "Textarea"]));
  });
});
