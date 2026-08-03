import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MoneyText } from "./money-text";

describe("MoneyText", () => {
  it("renders the caller-formatted value byte-for-byte with its optional pair", () => {
    const value = "R$ 1.234,567890";
    const markup = renderToStaticMarkup(<MoneyText pairLabel="BRL / PIX" size="large" value={value} />);

    expect(markup).toContain(value);
    expect(markup).toContain("BRL / PIX");
    expect(markup).toContain("font-mono");
    expect(markup).toContain("tabular-nums");
  });
});
