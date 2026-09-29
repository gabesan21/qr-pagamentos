"use client";

import { useLayoutEffect, useRef } from "react";

import { Input } from "@/components/ui/input";

import { brlCashDigits, brlCashValue, canonicalBrlInput, caretAtDigitBoundary, digitBoundary, formatBrlDisplay } from "./link-brl-amount";

// Visible BRL cash-mask input for the merchant FIXED_AMOUNT field. It is a
// presentation adapter only: it never carries a `name`, so the canonical
// exact decimal is posted by the sibling hidden `amount` control. Digit keys
// edit the unscaled digit string (cents semantics); a localized paste alone is
// parsed as an explicit decimal, keeping exact values up to six places and
// leaving malformed grouping visibly invalid.
export function BrlAmountInput({
  ariaDescribedBy,
  ariaLabelledBy,
  disabled,
  id,
  invalid,
  onBlur,
  onChange,
  value,
}: Readonly<{
  ariaDescribedBy?: string;
  ariaLabelledBy?: string;
  disabled: boolean;
  id: string;
  invalid: boolean;
  onBlur?: () => void;
  onChange: (value: string) => void;
  value: string;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !inputRef.current) return;
    const nextCaret = Math.max(0, pendingCaret.current);
    inputRef.current.setSelectionRange(nextCaret, nextCaret);
    pendingCaret.current = null;
  }, [value]);

  const updateCashDigits = (digits: string, precision: number, nextDigitBoundary: number) => {
    const next = brlCashValue(digits, precision);
    const remainingDigits = digits.length - nextDigitBoundary;
    const displayedDigits = digitBoundary(next.display, next.display.length);
    pendingCaret.current = caretAtDigitBoundary(next.display, Math.max(0, displayedDigits - remainingDigits));
    onChange(next.display);
  };

  const insertDigit = (input: HTMLInputElement, digit: string) => {
    const cash = brlCashDigits(value);
    const digits = cash?.digits ?? "";
    const precision = cash?.precision ?? 2;
    const selectionStart = input.selectionStart ?? value.length;
    const selectionEnd = input.selectionEnd ?? value.length;
    const start = digitBoundary(value, selectionStart);
    const end = digitBoundary(value, selectionEnd);
    updateCashDigits(`${digits.slice(0, start)}${digit}${digits.slice(end)}`, precision, start + 1);
  };

  const replaceWithPaste = (text: string) => {
    const canonical = canonicalBrlInput(text);
    if (!canonical) {
      onChange(text);
      return;
    }
    const display = canonical === "0" ? "R$ 0,00" : formatBrlDisplay(canonical);
    pendingCaret.current = display.length;
    onChange(display);
  };

  return (
    <Input
      aria-describedby={ariaDescribedBy}
      aria-invalid={invalid || undefined}
      aria-labelledby={ariaLabelledBy}
      autoComplete="off"
      data-invalid={invalid || undefined}
      disabled={disabled}
      id={id}
      inputMode="decimal"
      onBeforeInput={(event) => {
        const native = event.nativeEvent as InputEvent;
        if (!native.data || !/^\d$/.test(native.data)) return;
        event.preventDefault();
        insertDigit(event.currentTarget, native.data);
      }}
      onBlur={onBlur}
      onChange={(event) => {
        const native = event.nativeEvent as InputEvent;
        if (native.inputType === "insertText" || native.inputType === "deleteContentBackward" || native.inputType === "deleteContentForward") {
          const target = event.currentTarget;
          const cash = brlCashDigits(value);
          const precision = cash?.precision ?? 2;
          const digits = [...target.value].filter((character) => /\d/.test(character)).join("");
          const caret = digitBoundary(target.value, target.selectionStart ?? target.value.length);
          updateCashDigits(digits, precision, caret);
          return;
        }
        replaceWithPaste(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const input = event.currentTarget;
        const cash = brlCashDigits(value);
        const digits = cash?.digits ?? "";
        const precision = cash?.precision ?? 2;
        const start = digitBoundary(value, input.selectionStart ?? value.length);
        const end = digitBoundary(value, input.selectionEnd ?? value.length);

        if (/^\d$/.test(event.key)) {
          event.preventDefault();
          insertDigit(input, event.key);
        } else if (event.key === "Backspace") {
          event.preventDefault();
          const removeStart = start === end ? Math.max(0, start - 1) : start;
          updateCashDigits(`${digits.slice(0, removeStart)}${digits.slice(end)}`, precision, removeStart);
        } else if (event.key === "Delete") {
          event.preventDefault();
          const removeEnd = start === end ? start + 1 : end;
          updateCashDigits(`${digits.slice(0, start)}${digits.slice(removeEnd)}`, precision, start);
        } else if (event.key === "," || event.key === ".") {
          event.preventDefault();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        replaceWithPaste(event.clipboardData.getData("text"));
      }}
      ref={inputRef}
      required
      type="text"
      value={value}
    />
  );
}
