import { describe, expect, it } from "vitest";

import {
  brlCashValue,
  canonicalBrlInput,
  caretAtDigitBoundary,
  digitBoundary,
  formatBrlDisplay,
} from "./link-brl-amount";

describe("link BRL amount helpers", () => {
  it("formats a canonical amount as a BRL display without rounding", () => {
    expect(formatBrlDisplay("10")).toBe("R$ 10,00");
    expect(formatBrlDisplay("12.5")).toBe("R$ 12,50");
    expect(formatBrlDisplay("1234567.123456")).toBe("R$ 1.234.567,123456");
  });

  it("keeps an unfaithful/invalid canonical value untouched", () => {
    expect(formatBrlDisplay("0")).toBe("0");
    expect(formatBrlDisplay("abc")).toBe("abc");
  });

  it("parses a localized paste to the canonical exact decimal", () => {
    expect(canonicalBrlInput("R$ 1.234.567,123456")).toBe("1234567.123456");
    expect(canonicalBrlInput("R$ 12,5")).toBe("12.5");
    expect(canonicalBrlInput("1000")).toBe("1000");
  });

  it("keeps malformed or ambiguous grouping invalid instead of guessing", () => {
    for (const malformed of ["10.50", "1.2.3", "R$ 12,1234567", "1.23,45", "R$", ",50"]) {
      expect(canonicalBrlInput(malformed), malformed).toBe("");
    }
  });

  it("edits the unscaled digit string with cents semantics", () => {
    expect(brlCashValue("1000", 2)).toEqual({ display: "R$ 10,00", canonical: "10" });
    expect(brlCashValue("", 2)).toEqual({ display: "", canonical: "" });
    expect(brlCashValue("1234500001", 6)).toEqual({ display: "R$ 1.234,500001", canonical: "1234.500001" });
  });

  it("maps display positions to digit boundaries and back", () => {
    const display = "R$ 1.234,56";
    expect(digitBoundary(display, display.length)).toBe(6);
    expect(caretAtDigitBoundary(display, 6)).toBe(display.length);
    expect(caretAtDigitBoundary(display, 1)).toBe(4);
  });
});
