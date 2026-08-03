import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const provenancePath = "src/design-system/fonts/provenance.json";
const runtimeExtensions = new Set([".css", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const remoteFontPattern = /(?:fonts\.(?:googleapis|gstatic)\.com|use\.typekit\.net|fast\.fonts\.net)/i;
const legacyPackage = "@fontsource-variable/ibm-plex-sans";
const legacyImportPattern = /@fontsource-variable\/ibm-plex-sans/i;
const legacyCssPattern = /(?:font-family\s*:|--[\w-]*font[\w-]*\s*:)[^;\n]*IBM Plex Sans/i;
const targetImportPattern = /@fontsource\/(?:inter|sora|ibm-plex-mono)\/[^"'();\s]+/g;
const expectedFamilyContracts = [
  {
    family: "Inter",
    role: "body",
    package: "@fontsource/inter",
    version: "5.3.0",
    weights: [400, 500, 600],
    imports: [
      "@fontsource/inter/latin-400.css",
      "@fontsource/inter/latin-500.css",
      "@fontsource/inter/latin-600.css",
    ],
  },
  {
    family: "Sora",
    role: "display",
    package: "@fontsource/sora",
    version: "5.3.0",
    weights: [400, 500, 600, 700],
    imports: [
      "@fontsource/sora/latin-400.css",
      "@fontsource/sora/latin-500.css",
      "@fontsource/sora/latin-600.css",
      "@fontsource/sora/latin-700.css",
    ],
  },
  {
    family: "IBM Plex Mono",
    role: "numeric",
    package: "@fontsource/ibm-plex-mono",
    version: "5.3.0",
    weights: [400, 500, 600],
    imports: [
      "@fontsource/ibm-plex-mono/latin-400.css",
      "@fontsource/ibm-plex-mono/latin-500.css",
      "@fontsource/ibm-plex-mono/latin-600.css",
    ],
  },
];

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertCondition(condition, message, failures) {
  if (!condition) failures.push(message);
}

async function readJson(root, path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

async function runtimeSourceEntries(root) {
  const sourceRoot = join(root, "src");
  const entries = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile() && runtimeExtensions.has(extname(entry.name))) {
        entries.push({
          path: relative(root, absolute).replaceAll("\\", "/"),
          source: await readFile(absolute, "utf8"),
        });
      }
    }
  }

  await visit(sourceRoot);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export function auditRuntimeFontSources(entries, expectedImports) {
  const failures = [];
  const observedImports = new Map(expectedImports.map((value) => [value, 0]));

  for (const entry of entries) {
    if (remoteFontPattern.test(entry.source)) {
      failures.push(`Remote font host reference: ${entry.path}`);
    }
    if (legacyImportPattern.test(entry.source) || legacyCssPattern.test(entry.source)) {
      failures.push(`IBM Plex Sans runtime/CSS consumption: ${entry.path}`);
    }

    for (const candidate of entry.source.match(targetImportPattern) ?? []) {
      if (!observedImports.has(candidate)) {
        failures.push(`Unapproved Fontsource import ${candidate}: ${entry.path}`);
        continue;
      }
      observedImports.set(candidate, observedImports.get(candidate) + 1);
    }
  }

  for (const [fontImport, count] of observedImports) {
    if (count !== 1) failures.push(`Expected exactly one runtime import of ${fontImport}; found ${count}.`);
  }

  return failures;
}

export function auditFontDeclarations(provenance, project, lock) {
  const failures = [];
  const families = Array.isArray(provenance.families) ? provenance.families : [];
  const observedFamilyContracts = families.map((family) => ({
    family: family.family,
    role: family.role,
    package: family.package,
    version: family.version,
    weights: Array.isArray(family.weights) ? family.weights.map((weight) => weight.weight) : [],
    imports: Array.isArray(family.weights) ? family.weights.map((weight) => weight.import) : [],
  }));

  assertCondition(
    JSON.stringify(observedFamilyContracts) === JSON.stringify(expectedFamilyContracts),
    "Font family, role, package, version, weight, and import contract must remain exactly Inter 400/500/600, Sora 400/500/600/700, and IBM Plex Mono 400/500/600.",
    failures,
  );
  assertCondition(
    !Object.hasOwn(provenance, "transitionalDependency"),
    "Font provenance must not contain transitionalDependency.",
    failures,
  );
  assertCondition(
    !Object.hasOwn(project.dependencies ?? {}, legacyPackage),
    `${legacyPackage} must not be a project dependency.`,
    failures,
  );
  assertCondition(!lock.includes(legacyPackage), `${legacyPackage} must not appear in the lockfile.`, failures);

  for (const family of families) {
    assertCondition(
      project.dependencies?.[family.package] === family.version,
      `${family.package} is not pinned to ${family.version}.`,
      failures,
    );

    const importerEntry = new RegExp(
      `'${escapePattern(family.package)}':\\n\\s+specifier: ${escapePattern(family.version)}\\n\\s+version: ${escapePattern(family.version)}(?:\\n|$)`,
    );
    assertCondition(importerEntry.test(lock), `${family.package} lock importer pin drift.`, failures);

    const packageEntry = new RegExp(
      `'${escapePattern(family.package)}@${escapePattern(family.version)}':\\n\\s+resolution: \\{integrity: ${escapePattern(family.packageIntegrity)}\\}`,
    );
    assertCondition(packageEntry.test(lock), `${family.package} lock integrity drift.`, failures);
  }

  return failures;
}

export async function checkFontProvenance({ root = repositoryRoot, supplyOnly = false } = {}) {
  const failures = [];
  const provenance = await readJson(root, provenancePath);
  const project = await readJson(root, "package.json");
  const lock = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
  const expectedImports = [];

  assertCondition(provenance.version === 1, "Unsupported font provenance version.", failures);
  assertCondition(provenance.license === "OFL-1.1", "Font provenance must require OFL-1.1.", failures);
  assertCondition(provenance.subset === "latin", "Only the Latin production subset is admitted.", failures);
  assertCondition(provenance.format === "woff2", "Only WOFF2 production assets are admitted.", failures);
  assertCondition(
    JSON.stringify(provenance.locales) === JSON.stringify(["pt-BR", "en"]),
    "Font locale coverage must remain exactly pt-BR and en.",
    failures,
  );
  failures.push(...auditFontDeclarations(provenance, project, lock));

  for (const family of provenance.families) {
    const packageRoot = join(root, "node_modules", ...family.package.split("/"));
    const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    assertCondition(metadata.name === family.package, `${family.package} metadata name drift.`, failures);
    assertCondition(metadata.version === family.version, `${family.package} installed version drift.`, failures);
    assertCondition(metadata.license === "OFL-1.1", `${family.package} is not OFL-1.1.`, failures);
    assertCondition(metadata.publishHash === family.publishHash, `${family.package} publish hash drift.`, failures);

    const packageLicense = await readFile(join(packageRoot, "LICENSE"));
    const committedLicense = await readFile(join(root, family.licensePath));
    assertCondition(digest(packageLicense) === family.licenseSha256, `${family.package} package license hash drift.`, failures);
    assertCondition(digest(committedLicense) === family.licenseSha256, `${family.package} committed license hash drift.`, failures);
    assertCondition(packageLicense.equals(committedLicense), `${family.package} committed license is not byte-identical.`, failures);

    for (const weight of family.weights) {
      expectedImports.push(weight.import);
      const cssBytes = await readFile(join(root, weight.cssPath));
      const css = cssBytes.toString("utf8");
      const fontBytes = await readFile(join(root, weight.woff2Path));
      const expectedFile = weight.woff2Path.split("/").at(-1);

      assertCondition(digest(cssBytes) === weight.cssSha256, `${weight.import} CSS hash drift.`, failures);
      assertCondition(digest(fontBytes) === weight.woff2Sha256, `${weight.import} WOFF2 hash drift.`, failures);
      assertCondition(fontBytes.byteLength === weight.woff2Bytes, `${weight.import} WOFF2 size drift.`, failures);
      assertCondition(fontBytes.subarray(0, 4).toString("ascii") === "wOF2", `${weight.import} is not WOFF2.`, failures);
      assertCondition(css.includes(`font-family: '${family.family}'`), `${weight.import} family drift.`, failures);
      assertCondition(css.includes(`font-weight: ${weight.weight}`), `${weight.import} weight drift.`, failures);
      assertCondition(css.includes("font-style: normal"), `${weight.import} style drift.`, failures);
      assertCondition(css.includes("font-display: swap"), `${weight.import} display policy drift.`, failures);
      assertCondition(css.includes(`url(./files/${expectedFile}) format('woff2')`), `${weight.import} local WOFF2 reference drift.`, failures);
      assertCondition(!/https?:|latin-ext|cyrillic|greek|vietnamese/i.test(css), `${weight.import} is not a Latin-only local entrypoint.`, failures);
    }
  }

  if (!supplyOnly) {
    failures.push(...auditRuntimeFontSources(await runtimeSourceEntries(root), expectedImports));
  }

  return {
    failures,
    families: provenance.families.length,
    weights: expectedImports.length,
    mode: supplyOnly ? "supply-only" : "complete",
  };
}

async function main() {
  const result = await checkFontProvenance({ supplyOnly: process.argv.includes("--supply-only") });
  if (result.failures.length > 0) {
    for (const failure of result.failures) console.error(`FONT_PROVENANCE_ERROR ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Font provenance OK: ${result.families} families, ${result.weights} exact Latin WOFF2 weights (${result.mode}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
