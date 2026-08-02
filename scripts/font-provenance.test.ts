import { describe, expect, it } from "vitest";

import {
  auditRuntimeFontSources,
  checkFontProvenance,
} from "./check-font-provenance.mjs";

const expectedImports = [
  "@fontsource/inter/latin-400.css",
  "@fontsource/inter/latin-500.css",
  "@fontsource/inter/latin-600.css",
  "@fontsource/sora/latin-400.css",
  "@fontsource/sora/latin-500.css",
  "@fontsource/sora/latin-600.css",
  "@fontsource/sora/latin-700.css",
  "@fontsource/ibm-plex-mono/latin-400.css",
  "@fontsource/ibm-plex-mono/latin-500.css",
  "@fontsource/ibm-plex-mono/latin-600.css",
];

const completeLocalImports = expectedImports
  .map((fontImport) => `@import "${fontImport}";`)
  .join("\n");

describe("font provenance", () => {
  it("binds every installed package, license, Latin CSS entrypoint, WOFF2 asset, and lock integrity", async () => {
    const result = await checkFontProvenance({ supplyOnly: true });

    expect(result).toEqual({ failures: [], families: 3, weights: 10, mode: "supply-only" });
  });

  it("accepts exactly the approved local static-weight imports", () => {
    expect(auditRuntimeFontSources([{ path: "src/app/globals.css", source: completeLocalImports }], expectedImports)).toEqual([]);
  });

  it.each([
    ["legacy package import", `${completeLocalImports}\n@import "@fontsource-variable/ibm-plex-sans";`, "IBM Plex Sans runtime/CSS consumption"],
    ["legacy CSS family", `${completeLocalImports}\nbody { font-family: 'IBM Plex Sans'; }`, "IBM Plex Sans runtime/CSS consumption"],
    ["remote provider", `${completeLocalImports}\n@import url('https://fonts.googleapis.com/css2?family=Inter');`, "Remote font host reference"],
    ["unapproved subset", `${completeLocalImports}\n@import "@fontsource/inter/latin-ext-400.css";`, "Unapproved Fontsource import"],
  ])("rejects %s", (_case, source, expectedFailure) => {
    expect(auditRuntimeFontSources([{ path: "src/app/globals.css", source }], expectedImports).join("\n")).toContain(expectedFailure);
  });

  it("rejects missing and duplicate approved imports", () => {
    const source = completeLocalImports
      .replace('@import "@fontsource/sora/latin-700.css";\n', "")
      .concat('\n@import "@fontsource/inter/latin-400.css";');
    const failures = auditRuntimeFontSources([{ path: "src/app/globals.css", source }], expectedImports);

    expect(failures).toContain("Expected exactly one runtime import of @fontsource/inter/latin-400.css; found 2.");
    expect(failures).toContain("Expected exactly one runtime import of @fontsource/sora/latin-700.css; found 0.");
  });
});
