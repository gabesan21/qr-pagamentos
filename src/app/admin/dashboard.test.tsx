import { describe, expect, it } from "vitest";

import { formatAdminDashboardPrice, formatAdminDashboardRate } from "./dashboard";

describe("formatAdminDashboardRate", () => {
  it("shifts the exact decimal rate into a localized percent without Number", () => {
    expect(formatAdminDashboardRate("0.5000", "pt-BR")).toBe("50,00%");
    expect(formatAdminDashboardRate("0.5000", "en")).toBe("50.00%");
    expect(formatAdminDashboardRate("1.0000", "en")).toBe("100.00%");
    expect(formatAdminDashboardRate("0.3333", "en")).toBe("33.33%");
    expect(formatAdminDashboardRate("0.0416", "en")).toBe("4.16%");
  });
});

describe("formatAdminDashboardPrice", () => {
  it("groups the integer part and localizes the decimal separator without Number", () => {
    expect(formatAdminDashboardPrice("1234.50", "BRL", "pt-BR")).toBe("1.234,50 BRL");
    expect(formatAdminDashboardPrice("1234.50", "BRL", "en")).toBe("1,234.50 BRL");
    expect(formatAdminDashboardPrice("10", "USD", "en")).toBe("10 USD");
    expect(formatAdminDashboardPrice("7.25", null, "pt-BR")).toBe("7,25");
  });
});
