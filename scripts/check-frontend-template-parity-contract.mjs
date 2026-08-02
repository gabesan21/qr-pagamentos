import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.env.FRONTEND_PARITY_ROOT ?? process.cwd());
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const templateRoot = "docs/template/app";
const currentRoot = "src/app";
const promptPath = "FRONTEND_TEMPLATE_PROMPT.md";
const ownerIds = new Set(["12.2.1", "12.2.2", "12.2.3", "12.2.4", "12.3.1", "12.3.2", "12.4.1", "12.4.2", "12.4.3", "12.4.4", "12.5.1", "12.5.2", "12.5.3", "12.5.4", "12.5.5", "12.6.1", "12.6.2", "12.6.3", "12.7.2"]);
const kinds = new Set(["asset", "authored-class-occurrence", "current-route", "excluded-generated-ui", "interaction", "locale", "reachable-component", "state", "template-route", "theme"]);
const dispositions = new Set(["authorized-extrapolation", "authorized-gap", "current-contract-wins", "current-only-presentation-map", "direct-presentation-map", "excluded-unreachable-generated-ui", "presentation-and-feedback-reference", "presentation-reference"]);
const profiles = {
  browser: { project: "chromium", engine: "Chromium", pinnedBy: "playwright.config.ts" },
  environment: { deviceScaleFactor: 1, clock: "fixed fixture clock", fonts: "local settled fonts", animations: "disabled", caret: "hidden", externalRequests: "blocked" },
  viewports: ["320x1000", "375x1000", "768x1000", "1440x1000"],
  locales: ["pt-BR", "en"], themes: ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"],
  raster: { threshold: 0.1, maxDiffPixelRatio: 0.001, semanticAndGeometryFailuresIndependent: true },
  states: { "all-states": ["default", "loading", "empty", "error", "hover-focus", "disabled"], interactive: ["default", "hover-focus", "disabled"], default: ["default"], loading: ["loading"], "error-retry": ["error", "retry"] },
};
const stable = (value) => JSON.stringify(value);
const obligationId = (kind, source, suffix = "") => `${kind}:${sha256(`${source}${suffix}`).slice(0, 16)}`;
const absolute = (file) => path.join(root, file);
const fail = (failures, code, detail) => failures.push(`PARITY_${code} ${detail}`);

async function filesUnder(directory) {
  const entries = await readdir(absolute(directory), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => entry.isDirectory() ? filesUnder(`${directory}/${entry.name}`) : entry.isFile() ? [`${directory}/${entry.name}`] : []));
  return nested.flat().sort();
}
async function hashFile(file) { return sha256(await readFile(absolute(file))); }
async function exists(file) { try { return (await stat(absolute(file))).isFile(); } catch { return false; } }

function routeFor(file) {
  const parts = file.slice(`${currentRoot}/`.length).split("/");
  const leaf = parts.pop().replace(/\.tsx$/, "");
  const routeKind = leaf;
  const route = parts.filter((part) => !/^\(.+\)$/.test(part)).map((part) => part === "[lang]" ? ":locale?" : part).join("/");
  return { path: file, route: route ? `/${route}` : "/", routeKind };
}
function localSpecifiers(source) {
  const result = [];
  const expression = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(expression)) result.push(match[1] ?? match[2]);
  return result;
}
async function templateRoutes() {
  const source = await readFile(absolute(`${templateRoot}/src/App.tsx`), "utf8");
  return [...source.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<([A-Za-z0-9_]+)/g)].map((match) => ({ route: match[1], component: match[2] })).sort((left, right) => stable(left).localeCompare(stable(right)));
}
async function extractedObligations(graph) {
  const records = { "authored-class-occurrence": [], state: [], interaction: [], "reachable-component": [], asset: [], locale: [], theme: [] };
  for (const file of graph.reachableFiles) records["reachable-component"].push({ id: obligationId("reachable-component", file.path), source: file });
  for (const file of graph.reachableFiles) {
    const text = await readFile(absolute(file.path), "utf8");
    for (const [kind, expression] of [["authored-class-occurrence", /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g], ["state", /useState(?:<[^>]+>)?\s*\(([^)]*)\)/g], ["interaction", /\bon(?:Click|Change|Submit|KeyDown|Blur|Focus)\s*=/g]]) {
      let occurrence = 0;
      for (const match of text.matchAll(expression)) {
        occurrence += 1;
        const idKind = kind === "authored-class-occurrence" ? "authored-class" : kind;
        records[kind].push({ id: obligationId(idKind, file.path, `:${occurrence}`), source: { ...file, line: text.slice(0, match.index).split("\n").length, expressionSha256: sha256(match[0]) } });
      }
    }
  }
  for (const file of await filesUnder(`${templateRoot}/public`)) records.asset.push({ id: obligationId("asset", file), source: { path: file, sha256: await hashFile(file) } });
  const localeSource = { path: `${templateRoot}/src/i18n/index.tsx`, sha256: await hashFile(`${templateRoot}/src/i18n/index.tsx`) };
  for (const value of ["pt-BR", "en"]) records.locale.push({ id: `locale:${value}`, source: localeSource, value });
  const themeSource = { path: `${templateRoot}/src/theme/ThemeProvider.tsx`, sha256: await hashFile(`${templateRoot}/src/theme/ThemeProvider.tsx`) };
  for (const value of profiles.themes) records.theme.push({ id: `theme:${value}`, source: themeSource, value });
  return records;
}
async function resolveImport(from, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/") ? `${templateRoot}/src/${specifier.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  const candidates = [base, ...[".ts", ".tsx", ".js", ".jsx", ".css"].map((extension) => `${base}${extension}`), ...["index.ts", "index.tsx", "index.js", "index.jsx"].map((entry) => `${base}/${entry}`)];
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  return undefined;
}
async function templateGraph(failures) {
  const entry = `${templateRoot}/src/App.tsx`;
  const reachable = new Set(); const edges = []; const queue = [entry];
  while (queue.length) {
    const file = queue.shift(); if (reachable.has(file)) continue; reachable.add(file);
    const source = await readFile(absolute(file), "utf8");
    for (const specifier of localSpecifiers(source)) {
      const target = await resolveImport(file, specifier);
      if (target === undefined) { fail(failures, "UNRESOLVED_IMPORT", `${file} ${specifier}`); continue; }
      if (!target) continue;
      edges.push({ from: file, specifier, to: target }); queue.push(target);
    }
  }
  return { reachableFiles: await Promise.all([...reachable].sort().map(async (file) => ({ path: file, sha256: await hashFile(file) }))), edges: edges.sort((a, b) => stable(a).localeCompare(stable(b))) };
}
async function trackedReference(failures) {
  const { stdout } = await execFileAsync("git", ["ls-files", "--stage", "--", "docs/template", promptPath], { cwd: root });
  const tracked = new Set(stdout.trim().split("\n").filter(Boolean).map((line) => /^\d+ [0-9a-f]{40} \d\t(.+)$/.exec(line)?.[1]).filter(Boolean));
  const actual = [promptPath, ...(await filesUnder("docs/template"))].sort();
  for (const file of actual) if (!tracked.has(file)) fail(failures, "REFERENCE_UNTRACKED", file);
  for (const file of [...tracked].sort()) if (!actual.includes(file)) fail(failures, "REFERENCE_MISSING", file);
  for (const file of actual) if (tracked.has(file)) {
    const { stdout: indexed } = await execFileAsync("git", ["show", `:${file}`], { cwd: root, encoding: "buffer", maxBuffer: 8 * 1024 * 1024 });
    if (sha256(await readFile(absolute(file))) !== sha256(indexed)) fail(failures, "REFERENCE_HASH_STALE", file);
  }
  const prompt = await readFile(absolute(promptPath)); const info = await readFile(absolute("docs/template/info.md"));
  if (!prompt.equals(info)) fail(failures, "PROMPT_MISMATCH", `${promptPath} docs/template/info.md`);
  if (sha256(prompt) !== "99ccfb73123df773a59ea15cbc3c525a9a11a4b66117a6bcf903fc89f3b49a00") fail(failures, "PROMPT_HASH_STALE", promptPath);
}
function sameObjects(left, right) { return stable(left) === stable(right); }
function compareSet(failures, code, expected, actual, key = stable) {
  const expectedSet = new Set(expected.map(key)); const actualSet = new Set(actual.map(key));
  for (const value of [...expectedSet].filter((value) => !actualSet.has(value)).sort()) fail(failures, `${code}_MISSING`, value);
  for (const value of [...actualSet].filter((value) => !expectedSet.has(value)).sort()) fail(failures, `${code}_STALE`, value);
}
function ownerForSource(file, route = null) {
  if (route?.startsWith("/store/[slug]/pay")) return "12.6.3";
  if (route?.startsWith("/store/[slug]")) return "12.6.2";
  if (route?.startsWith("/pay/")) return "12.6.1";
  if (route === "/login" || route === "/reset-password") return "12.3.2";
  if (file === "src/app/design-system/page.tsx") return "12.2.4";
  if (route?.startsWith("/admin/orders") || route?.startsWith("/admin/payment-links")) return "12.4.2";
  if (route?.startsWith("/admin/accounts")) return "12.4.3";
  if (route?.startsWith("/admin/settings")) return "12.4.4";
  if (route === "/admin") return "12.4.1";
  if (file === "src/app/admin/page.tsx" || file === "src/app/admin/loading.tsx" || file === "src/app/admin/error.tsx") return "12.4.1";
  if (route === "/") return "12.5.1";
  if (route?.startsWith("/orders")) return "12.5.2";
  if (route?.startsWith("/links")) return "12.5.3";
  if (route?.startsWith("/catalog")) return "12.5.4";
  if (route === "/profile" || route === "/settings") return "12.5.5";
  if (file.startsWith("docs/template/app/public/") || file.endsWith("/components/Logo.tsx")) return "12.2.2";
  if (file.endsWith("/theme/ThemeProvider.tsx")) return "12.2.1";
  if (file.includes("/components/ui/")) return "12.2.3";
  if (/\/(?:Layout|Navbar|Footer|RoleGuard)\.tsx$/.test(file)) return "12.3.1";
  if (file.includes("/pages/auth/") || file.endsWith("/mock/session.tsx")) return "12.3.2";
  if (file.includes("/pages/admin/AdminDashboard")) return "12.4.1";
  if (file.includes("/pages/admin/AdminOrder") || file.includes("/pages/admin/AdminLink")) return "12.4.2";
  if (file.includes("/pages/admin/AdminAccount")) return "12.4.3";
  if (file.includes("/pages/admin/AdminSettings")) return "12.4.4";
  if (file.includes("/pages/merchant/MerchantDashboard")) return "12.5.1";
  if (file.includes("/pages/merchant/MerchantOrder")) return "12.5.2";
  if (file.includes("/pages/links/")) return "12.5.3";
  if (file.includes("/pages/catalog/")) return "12.5.4";
  if (file.includes("/pages/profile/") || file.includes("/pages/settings/")) return "12.5.5";
  if (file.includes("/pages/checkout/")) return "12.6.1";
  return "12.7.2";
}

export async function checkFrontendTemplateParity() {
  const failures = [];
  let manifest; let records;
  try { manifest = JSON.parse(await readFile(absolute("docs/frontend-template-parity/manifest.json"), "utf8")); } catch { fail(failures, "MANIFEST_INVALID", "docs/frontend-template-parity/manifest.json"); }
  let raw = "";
  try { raw = await readFile(absolute("docs/frontend-template-parity/obligations.ndjson"), "utf8"); records = raw.endsWith("\n") ? raw.slice(0, -1).split("\n").map((line, index) => { try { return JSON.parse(line); } catch { fail(failures, "NDJSON_INVALID", `line=${index + 1}`); return null; } }).filter(Boolean) : []; if (!raw.endsWith("\n")) fail(failures, "NDJSON_NEWLINE_MISSING", "obligations.ndjson"); } catch { records = []; fail(failures, "NDJSON_MISSING", "obligations.ndjson"); }
  if (!manifest) throw new Error(failures.join("\n"));
  if (manifest.schemaVersion !== 1) fail(failures, "SCHEMA_VERSION", String(manifest.schemaVersion));
  if (!manifest.obligations || manifest.obligations.path !== "docs/frontend-template-parity/obligations.ndjson" || manifest.obligations.count !== records.length || manifest.obligations.sha256 !== sha256(raw)) fail(failures, "NDJSON_BINDING", "manifest obligations");
  await trackedReference(failures);
  const ids = new Set();
  for (const record of records) {
    if (!record.id || ids.has(record.id)) fail(failures, "OBLIGATION_ID_DUPLICATE", record.id ?? "missing"); ids.add(record.id);
    if (!kinds.has(record.kind)) fail(failures, "OBLIGATION_KIND_INVALID", record.id);
    if (!dispositions.has(record.disposition)) fail(failures, "DISPOSITION_INVALID", record.id);
    const excluded = record.disposition === "excluded-unreachable-generated-ui";
    if (excluded ? record.laterOwner !== null || record.target !== null || record.evidence !== null || typeof record.reason !== "string" : !ownerIds.has(record.laterOwner) || !record.target || !profiles.states[record.evidenceTarget]) fail(failures, "OBLIGATION_MAPPING_INVALID", record.id);
    if (record.source?.path && record.source?.sha256 && await exists(record.source.path) && await hashFile(record.source.path) !== record.source.sha256) fail(failures, "SOURCE_HASH_STALE", `${record.id} ${record.source.path}`);
    if (!excluded && ["authorized-extrapolation", "current-contract-wins", "current-only-presentation-map"].includes(record.disposition) && typeof record.reason !== "string") fail(failures, "OBLIGATION_REASON_MISSING", record.id);
    if (!excluded && record.laterOwner !== ownerForSource(record.source?.path ?? "", ["current-route", "template-route"].includes(record.kind) ? record.route : null)) fail(failures, "OWNER_INVALID", record.id);
  }
  for (const [name, states] of Object.entries(profiles.states)) {
    const profile = manifest.evidenceProfiles?.[name]; const expected = { browser: profiles.browser, environment: profiles.environment, viewports: profiles.viewports, locales: profiles.locales, themes: profiles.themes, states, raster: profiles.raster };
    if (!sameObjects(profile, expected)) fail(failures, "EVIDENCE_PROFILE_INVALID", name);
  }
  if (!manifest.evidenceProfiles || Object.keys(manifest.evidenceProfiles).sort().join(",") !== Object.keys(profiles.states).sort().join(",")) fail(failures, "EVIDENCE_PROFILE_SET_INVALID", "profiles");
  const graph = await templateGraph(failures);
  compareSet(failures, "REACHABLE_FILE", graph.reachableFiles, manifest.graph?.reachableFiles ?? [], (item) => item.path);
  for (const item of manifest.graph?.reachableFiles ?? []) if ((await exists(item.path)) && await hashFile(item.path) !== item.sha256) fail(failures, "REACHABLE_HASH_STALE", item.path);
  compareSet(failures, "IMPORT_EDGE", graph.edges, manifest.graph?.edges ?? []);
  const extracted = await extractedObligations(graph);
  for (const kind of Object.keys(extracted)) {
    const mapped = records.filter((record) => record.kind === kind).map((record) => ({ id: record.id, source: record.source, ...(record.value ? { value: record.value } : {}) }));
    const label = kind === "authored-class-occurrence" ? "AUTHORED_CLASS" : kind.toUpperCase().replaceAll("-", "_");
    compareSet(failures, label, extracted[kind], mapped);
  }
  const mappedTemplateRoutes = records.filter((record) => record.kind === "template-route").map((record) => ({ route: record.route, component: record.component })).sort((left, right) => stable(left).localeCompare(stable(right)));
  compareSet(failures, "TEMPLATE_ROUTE", await templateRoutes(), mappedTemplateRoutes);
  const allTemplateFiles = await filesUnder(templateRoot);
  const excludedFiles = records.filter((record) => record.kind === "excluded-generated-ui").map((record) => record.source.path).sort();
  const generatedUi = allTemplateFiles.filter((file) => file.startsWith(`${templateRoot}/src/components/ui/`) && /\.[jt]sx?$/.test(file));
  compareSet(failures, "EXCLUDED_GENERATED_UI", generatedUi.filter((file) => !graph.reachableFiles.some((item) => item.path === file)), excludedFiles, (value) => value);
  const currentFiles = (await filesUnder(currentRoot)).filter((file) => /\/(?:page|loading|error)\.tsx$/.test(file));
  const routeKey = (item) => stable({ path: item.path, sha256: item.sha256, route: item.route, routeKind: item.routeKind });
  const currentRoutes = await Promise.all(currentFiles.map(async (file) => ({ ...routeFor(file), sha256: await hashFile(file) })));
  const mappedRoutes = records.filter((record) => record.kind === "current-route").map((record) => ({ path: record.source?.path, sha256: record.source?.sha256, route: record.route, routeKind: record.routeKind }));
  compareSet(failures, "CURRENT_ROUTE", currentRoutes, mappedRoutes, routeKey);
  const counts = Object.fromEntries([...kinds].sort().map((kind) => [kind, records.filter((record) => record.kind === kind).length]));
  if (failures.length) throw new Error(failures.sort().join("\n"));
  return { records: records.length, reachableFiles: graph.reachableFiles.length, importEdges: graph.edges.length, currentRoutes: currentRoutes.length, counts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { const result = await checkFrontendTemplateParity(); console.log(`FRONTEND_PARITY_OK records=${result.records} reachable_files=${result.reachableFiles} import_edges=${result.importEdges} current_routes=${result.currentRoutes}`); for (const [kind, count] of Object.entries(result.counts)) console.log(`FRONTEND_PARITY_COUNT ${kind}=${count}`); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
