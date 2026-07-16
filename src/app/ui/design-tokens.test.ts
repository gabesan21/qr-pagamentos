import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { findDesignTokenViolations } from "../../../scripts/check-design-tokens.mjs";

const contrastPairs = {
  light: {
    action: ["#ffffff", "#006b5b"],
    danger: ["#ffffff", "#b3261e"],
    focus: ["#006b5b", "#f7f9f8"],
    primary: ["#16211e", "#f7f9f8"],
    success: ["#ffffff", "#006b5b"],
    warning: ["#3d2b00", "#ffe8a6"],
  },
  dark: {
    action: ["#10221d", "#42d6b4"],
    danger: ["#3b0906", "#ffb4ab"],
    focus: ["#42d6b4", "#121917"],
    primary: ["#edf5f1", "#121917"],
    success: ["#10221d", "#42d6b4"],
    warning: ["#10221d", "#ffd98a"],
  },
} as const;

function relativeLuminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("design tokens", () => {
  it("allows reference values only in the designated token source", () => {
    expect(findDesignTokenViolations()).toEqual([]);
  });

  it("reports every rejected raw-value fixture with its path and value", () => {
    const violations = findDesignTokenViolations([
      { path: join(process.cwd(), "src/app/ui/fixture.tsx"), source: "<main style={{ color: '#112233' }} />" },
      { path: join(process.cwd(), "src/app/ui/fixture.css"), source: ".fixture { padding: 16px; }" },
      { path: join(process.cwd(), "src/app/ui/type-fixture.css"), source: ".fixture { font-weight: 700; }" },
      { path: join(process.cwd(), "src/app/ui/line-height-fixture.css"), source: ".fixture { line-height: 1.7; }" },
    ]);

    expect(violations).toContain("src/app/ui/fixture.tsx: raw visual value #112233");
    expect(violations).toContain("src/app/ui/fixture.tsx: inline visual style style=");
    expect(violations).toContain("src/app/ui/fixture.css: raw visual value 16px");
    expect(violations).toContain("src/app/ui/type-fixture.css: raw visual value font-weight:");
    expect(violations).toContain("src/app/ui/line-height-fixture.css: raw visual value line-height:");
  });

  it("keeps the token markers in the designated source", () => {
    const source = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(source).toContain("/* design-tokens:start */");
    expect(source).toContain("/* design-tokens:end */");
  });

  it.each(Object.entries(contrastPairs))("meets text and focus contrast in %s mode", (_theme, pairs) => {
    for (const [name, [foreground, background]] of Object.entries(pairs)) {
      expect(contrastRatio(foreground, background), name === "focus" ? name : name).toBeGreaterThanOrEqual(name === "focus" ? 3 : 4.5);
    }
  });
});
