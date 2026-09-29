import { describe, expect, it } from "vitest";

import { formatOrderAmount, formatOrderCompactDate, formatOrderCompactTime } from "./order-format";

describe("merchant order amount formatting", () => {
  it("renders BRL with the Brazilian symbol and at least two decimals in both locales", () => {
    expect(formatOrderAmount("10", "BRL", "pt-BR")).toBe("R$ 10,00");
    expect(formatOrderAmount("12.5", "BRL", "pt-BR")).toBe("R$ 12,50");
    expect(formatOrderAmount("1234567.89", "BRL", "pt-BR")).toBe("R$ 1.234.567,89");
    expect(formatOrderAmount("34.9", "BRL", "en")).toBe("R$ 34.90");
  });

  it("keeps every significant BRL decimal beyond two places without coercion", () => {
    expect(formatOrderAmount("1234567.123456", "BRL", "pt-BR")).toBe("R$ 1.234.567,123456");
    expect(formatOrderAmount("12345678901234567890.123456", "BRL", "pt-BR")).toBe("R$ 12.345.678.901.234.567.890,123456");
  });

  it("uses American separators for USD and USDT regardless of locale", () => {
    expect(formatOrderAmount("1234.5", "USD", "pt-BR")).toBe("1,234.50 USD");
    expect(formatOrderAmount("10", "USDT", "pt-BR")).toBe("10.00 USDT");
    expect(formatOrderAmount("34.9", "USD", "en")).toBe("34.90 USD");
  });

  it("localizes any other resolved currency code", () => {
    expect(formatOrderAmount("1234.56", "EUR", "pt-BR")).toBe("1.234,56 EUR");
    expect(formatOrderAmount("1234.56", "EUR", "en")).toBe("1,234.56 EUR");
  });

  it("renders an unresolved currency as the bare localized exact amount, never as BRL", () => {
    expect(formatOrderAmount("34.9", null, "pt-BR")).toBe("34,9");
    expect(formatOrderAmount("1234.5", null, "en")).toBe("1,234.5");
  });
});

describe("merchant order compact instant", () => {
  it("renders two-digit day/month/year pinned to UTC", () => {
    // 02:30 UTC would roll to the previous day under a negative-offset local
    // zone: the formatter must keep the stored UTC calendar day.
    expect(formatOrderCompactDate(new Date("2026-07-01T02:30:00.000Z"), "en")).toBe("07/01/26");
    expect(formatOrderCompactDate(new Date("2026-07-01T02:30:00.000Z"), "pt-BR")).toBe("01/07/26");
  });

  it("renders a separate two-digit UTC hour and minute", () => {
    expect(formatOrderCompactTime(new Date("2026-07-01T02:30:00.000Z"), "en")).toBe("02:30");
    expect(formatOrderCompactTime(new Date("2026-07-01T23:05:00.000Z"), "pt-BR")).toBe("23:05");
  });
});
