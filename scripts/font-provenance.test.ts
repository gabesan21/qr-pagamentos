import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

import {
  auditFontDeclarations,
  auditRuntimeFontSources,
  checkFontProvenance,
} from "./check-font-provenance.mjs";

const repositoryRoot = new URL("../", import.meta.url);

type MutableProvenance = {
  families: Array<{
    family: string;
    package: string;
    role: string;
    weights: Array<{ import: string; weight: number }>;
  }>;
  transitionalDependency?: { package: string; version: string };
  [key: string]: unknown;
};

type MutableProject = {
  dependencies: Record<string, string>;
  [key: string]: unknown;
};

type DeclarationMutation = (
  provenance: MutableProvenance,
  project: MutableProject,
  lock: string,
) => string | void;

const declarationMutations: Array<{
  name: string;
  mutate: DeclarationMutation;
  failure: string;
}> = [
  {
    name: "target lock integrity drift",
    mutate: (_provenance, _project, lock) =>
      lock.replace("sha512-SqW3OpKxxfKvxD", "sha512-XqW3OpKxxfKvxD"),
    failure: "@fontsource/sora lock integrity drift.",
  },
  {
    name: "target provenance drift",
    mutate: (provenance) => {
      provenance.families[0].role = "display";
    },
    failure: "Font family, role, package, version, weight, and import contract must remain exactly",
  },
  {
    name: "transitional provenance reintroduction",
    mutate: (provenance) => {
      provenance.transitionalDependency = { package: "@fontsource-variable/ibm-plex-sans", version: "5.2.8" };
    },
    failure: "Font provenance must not contain transitionalDependency.",
  },
  {
    name: "legacy dependency reintroduction",
    mutate: (_provenance, project) => {
      project.dependencies["@fontsource-variable/ibm-plex-sans"] = "5.2.8";
    },
    failure: "@fontsource-variable/ibm-plex-sans must not be a project dependency.",
  },
  {
    name: "legacy lock reintroduction",
    mutate: (_provenance, _project, lock) =>
      `${lock}\n'@fontsource-variable/ibm-plex-sans@5.2.8': {}\n`,
    failure: "@fontsource-variable/ibm-plex-sans must not appear in the lockfile.",
  },
];

const targetPackages = ["@fontsource/inter", "@fontsource/sora", "@fontsource/ibm-plex-mono"];
const targetWeights = [
  ["Inter", 400],
  ["Inter", 500],
  ["Inter", 600],
  ["Sora", 400],
  ["Sora", 500],
  ["Sora", 600],
  ["Sora", 700],
  ["IBM Plex Mono", 400],
  ["IBM Plex Mono", 500],
  ["IBM Plex Mono", 600],
] as const;

async function readDeclarationFixture() {
  const provenance = JSON.parse(
    await readFile(new URL("src/design-system/fonts/provenance.json", repositoryRoot), "utf8"),
  ) as MutableProvenance;
  const project = JSON.parse(
    await readFile(new URL("package.json", repositoryRoot), "utf8"),
  ) as MutableProject;
  const lock = await readFile(new URL("pnpm-lock.yaml", repositoryRoot), "utf8");
  return { provenance, project, lock };
}

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

  it.each(declarationMutations)("rejects $name", async ({ mutate, failure }) => {
    const { provenance, project, lock } = await readDeclarationFixture();
    const mutatedLock = mutate(provenance, project, lock) ?? lock;

    expect(auditFontDeclarations(provenance, project, mutatedLock).join("\n")).toContain(failure);
  });

  it.each(targetPackages)("rejects direct dependency pin drift for %s", async (targetPackage) => {
    const { provenance, project, lock } = await readDeclarationFixture();
    project.dependencies[targetPackage] = "5.3.1";

    expect(auditFontDeclarations(provenance, project, lock)).toContain(
      `${targetPackage} is not pinned to 5.3.0.`,
    );
  });

  it.each(targetWeights)("rejects provenance import drift for %s %i", async (familyName, weightValue) => {
    const { provenance, project, lock } = await readDeclarationFixture();
    const family = provenance.families.find(({ family: candidate }) => candidate === familyName);
    const weight = family?.weights.find(({ weight: candidate }) => candidate === weightValue);
    expect(weight).toBeDefined();
    weight!.import = `${weight!.import}.drift`;

    expect(auditFontDeclarations(provenance, project, lock).join("\n")).toContain(
      "Font family, role, package, version, weight, and import contract must remain exactly",
    );
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
