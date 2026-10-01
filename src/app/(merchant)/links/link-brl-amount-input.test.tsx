// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrlAmountInput } from "./link-brl-amount-input";

function Harness({ onChange }: Readonly<{ onChange?: (value: string) => void }>) {
  const [value, setValue] = useState("");
  return (
    <BrlAmountInput
      disabled={false}
      id="amount"
      invalid={false}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      value={value}
    />
  );
}

function amountInput(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

afterEach(cleanup);

describe("BrlAmountInput", () => {
  it("applies cents semantics while typing and keeps the caret at the inserted digit", () => {
    render(<Harness />);
    const amount = amountInput();
    for (const key of "1000") fireEvent.keyDown(amount, { key });

    expect(amount.value).toBe("R$ 10,00");
    expect(amount.selectionStart).toBe(amount.value.length);
    expect(amount.getAttribute("name")).toBeNull();
  });

  it("handles replacement, backspace, and delete against masked digits", () => {
    render(<Harness />);
    const amount = amountInput();

    for (const key of "12") fireEvent.keyDown(amount, { key });
    expect(amount.value).toBe("R$ 0,12");

    amount.setSelectionRange(0, amount.value.length);
    fireEvent.keyDown(amount, { key: "5" });
    expect(amount.value).toBe("R$ 0,05");

    fireEvent.keyDown(amount, { key: "Backspace" });
    expect(amount.value).toBe("R$ 0,00");
    amount.setSelectionRange(0, amount.value.length);
    fireEvent.keyDown(amount, { key: "Backspace" });
    expect(amount.value).toBe("");

    for (const key of "12") fireEvent.keyDown(amount, { key });
    amount.setSelectionRange(4, 4);
    fireEvent.keyDown(amount, { key: "Delete" });
    expect(amount.value).toBe("R$ 0,02");
  });

  it("keeps mobile input events without keydown in the cash-mask edit path", () => {
    render(<Harness />);
    const amount = amountInput();

    fireEvent.input(amount, { data: "1", inputType: "insertText", target: { selectionEnd: 1, selectionStart: 1, value: "1" } });
    fireEvent.input(amount, { data: "0", inputType: "insertText", target: { selectionEnd: 8, selectionStart: 8, value: "R$ 0,010" } });
    fireEvent.input(amount, { data: "0", inputType: "insertText", target: { selectionEnd: 8, selectionStart: 8, value: "R$ 0,100" } });
    fireEvent.input(amount, { data: "0", inputType: "insertText", target: { selectionEnd: 8, selectionStart: 8, value: "R$ 1,000" } });
    expect(amount.value).toBe("R$ 10,00");

    fireEvent.input(amount, { inputType: "deleteContentBackward", target: { selectionEnd: 7, selectionStart: 7, value: "R$ 10,0" } });
    expect(amount.value).toBe("R$ 1,00");

    fireEvent.input(amount, { data: "5", inputType: "insertText", target: { selectionEnd: 1, selectionStart: 1, value: "5" } });
    expect(amount.value).toBe("R$ 0,05");
  });

  it("parses an exact localized paste without rounding and keeps malformed grouping visible", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const amount = amountInput();

    fireEvent.paste(amount, { clipboardData: { getData: () => "R$ 1.234,500001" } });
    expect(amount.value).toBe("R$ 1.234,500001");
    expect(onChange).toHaveBeenLastCalledWith("R$ 1.234,500001");

    fireEvent.paste(amount, { clipboardData: { getData: () => "1.23,45" } });
    expect(amount.value).toBe("1.23,45");
    expect(onChange).toHaveBeenLastCalledWith("1.23,45");
  });
});
