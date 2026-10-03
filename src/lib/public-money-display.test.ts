import { describe, expect, it } from "vitest";

import { formatPublicMoney } from "./public-money-display";

describe("public monetary display", () => {
  it("shows BRL consistently in both locales without rounding or float conversion", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      expect(formatPublicMoney("0.000001", "BRL", locale)).toBe("R$ 0,000001");
      expect(formatPublicMoney("12345678901234567.123456", "BRL", locale)).toBe("R$ 12.345.678.901.234.567,123456");
      expect(formatPublicMoney("10", "BRL", locale)).toBe("R$ 10,00");
    }
  });

  it("preserves non-BRL and unresolved currency identities", () => {
    expect(formatPublicMoney("1234.5", "USD", "pt-BR")).toBe("1,234.50 USD");
    expect(formatPublicMoney("1234.5", "EUR", "pt-BR")).toBe("1.234,5 EUR");
    expect(formatPublicMoney("1234.5", null, "en")).toBe("1,234.5");
    expect(formatPublicMoney("", "BRL", "pt-BR")).toBe("");
  });
});
