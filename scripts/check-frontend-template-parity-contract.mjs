import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

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
function sourceFileFor(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function lineFor(sourceFile, node) { return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1; }
function exactText(sourceFile, node) { return node.getText(sourceFile); }
function containsIdentifier(node, name) {
  let found = false;
  const visit = (child) => { if (ts.isIdentifier(child) && child.text === name) found = true; if (!found) ts.forEachChild(child, visit); };
  visit(node);
  return found;
}
function callName(call, sourceFile) {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return exactText(sourceFile, call.expression);
}
function importedFixtureNames(sourceFile) {
  const names = [];
  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || node.moduleSpecifier.text !== "@/mock/fixtures") return;
    const clause = node.importClause;
    if (clause?.name) names.push(clause.name.text);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) names.push(element.name.text);
    }
  });
  return [...new Set(names)].sort();
}
function handlerDeclarations(sourceFile) {
  const declarations = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return declarations;
}
function stateSetters(sourceFile) {
  const setters = new Map();
  const visit = (node) => {
    if (ts.isCallExpression(node) && exactText(sourceFile, node.expression) === "useState") {
      const declaration = node.parent;
      if (ts.isVariableDeclaration(declaration) && ts.isArrayBindingPattern(declaration.name)) {
        const [state, setter] = declaration.name.elements;
        if (setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)) {
          const stateName = state && ts.isBindingElement(state) && ts.isIdentifier(state.name) ? state.name.text : `omitted-state-via-${setter.name.text}`;
          setters.set(setter.name.text, stateName);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return setters;
}
function lexicalFunctionOwner(node) {
  let owner = node.parent;
  while (owner && !ts.isFunctionLike(owner)) owner = owner.parent;
  return owner;
}
function lexicalOwnerName(sourceFile, owner) {
  if (owner.name) return exactText(sourceFile, owner.name);
  if ((ts.isArrowFunction(owner) || ts.isFunctionExpression(owner)) && ts.isVariableDeclaration(owner.parent) && ts.isIdentifier(owner.parent.name)) return owner.parent.name.text;
  return `<anonymous@${lineFor(sourceFile, owner)}>`;
}
function lexicalOwnerDescriptor(sourceFile, owner) {
  const startLine = lineFor(sourceFile, owner);
  const endLine = sourceFile.getLineAndCharacterOfPosition(owner.end).line + 1;
  const name = lexicalOwnerName(sourceFile, owner);
  return { id: `scope:${sha256(`${sourceFile.fileName}:${name}:${owner.pos}:${owner.end}`).slice(0, 20)}`, name, startLine, endLine };
}
function stateSemantics(sourceFile, call) {
  const declaration = call.parent;
  const owner = lexicalFunctionOwner(declaration);
  if (!owner) throw new Error(`PARITY_STATE_OWNER_SCOPE_MISSING ${sourceFile.fileName} line=${lineFor(sourceFile, call)}`);
  const ownerScope = lexicalOwnerDescriptor(sourceFile, owner);
  const binding = ts.isVariableDeclaration(declaration) && ts.isArrayBindingPattern(declaration.name) ? declaration.name.elements : [];
  const setterName = binding[1] && ts.isBindingElement(binding[1]) && ts.isIdentifier(binding[1].name) ? binding[1].name.text : null;
  const stateName = binding[0] && ts.isBindingElement(binding[0]) && ts.isIdentifier(binding[0].name) ? binding[0].name.text : setterName ? `omitted-state-via-${setterName}` : "unbound-useState";
  const transitions = [];
  const viewBindings = [];
  const derivedReads = [];
  const readSites = [];
  const visit = (node) => {
    if (setterName && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === setterName) {
      transitions.push({ line: lineFor(sourceFile, node), call: exactText(sourceFile, node), nextValue: node.arguments.map((argument) => exactText(sourceFile, argument)).join(", ") });
    }
    if (ts.isJsxExpression(node) && node.expression && containsIdentifier(node.expression, stateName)) {
      viewBindings.push({ line: lineFor(sourceFile, node), expression: exactText(sourceFile, node.expression) });
    }
    if ((ts.isConditionalExpression(node) || ts.isBinaryExpression(node) || ts.isPrefixUnaryExpression(node)) && containsIdentifier(node, stateName)) {
      derivedReads.push({ line: lineFor(sourceFile, node), expression: exactText(sourceFile, node) });
    }
    if (ts.isIdentifier(node) && node.text === stateName) {
      let context = node.parent;
      while (context && context !== owner && !ts.isCallExpression(context) && !ts.isJsxExpression(context) && !ts.isVariableDeclaration(context) && !ts.isReturnStatement(context) && !ts.isExpressionStatement(context)) context = context.parent;
      if (context && context !== declaration && context !== owner) readSites.push({ line: lineFor(sourceFile, context), expression: exactText(sourceFile, context) });
    }
    ts.forEachChild(node, visit);
  };
  visit(owner);
  const unique = (items) => [...new Map(items.map((item) => [stable(item), item])).values()].sort((a, b) => stable(a).localeCompare(stable(b)));
  return {
    name: stateName,
    setter: setterName,
    ownerScope,
    initialValue: call.arguments.length ? call.arguments.map((argument) => exactText(sourceFile, argument)).join(", ") : "undefined",
    trigger: { transitions: unique(transitions), initializationOnly: transitions.length === 0 },
    expectedView: {
      mode: viewBindings.length ? "direct-jsx" : derivedReads.length ? "derived-read" : stateName.startsWith("omitted-state-via-") ? "render-invalidation-only" : readSites.length ? "indirect-read" : "write-only",
      jsxBindings: unique(viewBindings),
      derivedReads: unique(derivedReads),
      readSites: unique(readSites),
      directJsxBinding: viewBindings.length > 0,
    },
  };
}
function interactionSemantics(sourceFile, attribute, declarations, setters) {
  const event = attribute.name.text.slice(2).replace(/^[A-Z]/, (letter) => letter.toLowerCase());
  const initializer = attribute.initializer;
  const handlerExpression = initializer && ts.isJsxExpression(initializer) && initializer.expression ? exactText(sourceFile, initializer.expression) : initializer ? exactText(sourceFile, initializer) : "missing";
  const referenced = initializer && ts.isJsxExpression(initializer) && initializer.expression && ts.isIdentifier(initializer.expression) ? initializer.expression.text : null;
  const implementationNode = referenced ? declarations.get(referenced) : initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer;
  const effects = [];
  if (implementationNode) {
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const name = callName(node, sourceFile);
        const kind = setters.has(name) ? "state-update" : /^(?:toast|showToast)$/.test(name) ? "toast" : /^(?:navigate|setParams|replace|push)$/.test(name) ? "navigation" : /^on[A-Z]/.test(name) ? "callback" : "call";
        effects.push({ kind, call: exactText(sourceFile, node), line: lineFor(sourceFile, node), ...(setters.has(name) ? { state: setters.get(name) } : {}) });
      }
      ts.forEachChild(node, visit);
    };
    visit(implementationNode);
  }
  const uniqueEffects = [...new Map(effects.map((item) => [stable(item), item])).values()].sort((a, b) => stable(a).localeCompare(stable(b)));
  return {
    event,
    action: { handlerExpression, resolution: referenced ? (implementationNode ? "local-declaration" : "caller-provided-callback") : "inline-expression", implementation: implementationNode ? exactText(sourceFile, implementationNode) : handlerExpression },
    feedback: { mode: uniqueEffects.length ? "effect-calls" : referenced && !implementationNode ? "delegated-callback" : "effect-free-expression", effects: uniqueEffects, effectFree: uniqueEffects.length === 0 },
  };
}
function currentTargetContext(graph, routeEntries, currentRoutes, currentFiles) {
  const outgoing = new Map();
  for (const edge of graph.edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  const descendants = (start) => { const seen = new Set(); const queue = [start]; while (queue.length) { const file = queue.shift(); if (seen.has(file)) continue; seen.add(file); queue.push(...(outgoing.get(file) ?? [])); } return seen; };
  const routesByFile = new Map();
  for (const entry of routeEntries.filter((entry) => entry.sourcePath)) for (const file of descendants(entry.sourcePath)) routesByFile.set(file, [...(routesByFile.get(file) ?? []), entry.route]);
  const concreteRoute = (route) => route.replace(/:([A-Za-z0-9_]+)/g, "[$1]");
  const allConcreteTemplateRoutes = routeEntries.map((entry) => entry.route).filter((route) => route !== "*").map(concreteRoute);
  return (file) => {
    const templateRouteValues = [...new Set(routesByFile.get(file) ?? allConcreteTemplateRoutes)].sort();
    const concreteTemplateRouteValues = templateRouteValues.filter((route) => route !== "*").map(concreteRoute);
    let matching = currentRoutes.filter((item) => concreteTemplateRouteValues.includes(item.route));
    if (!matching.length) matching = currentRoutes.filter((item) => ownerForSource(item.path, item.route) === ownerForSource(file));
    const base = path.posix.basename(file).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    let components = currentFiles.filter((candidate) => path.posix.basename(candidate).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]/g, "") === base);
    if (!matching.length && !components.length) {
      const owner = ownerForSource(file);
      const ownerRoot = {
        "12.2.1": /^src\/(?:design-system\/themes\.ts|app\/globals\.css)$/,
        "12.2.2": /^src\/brand\//,
        "12.2.3": /^src\/components\/ui\//,
        "12.3.1": /^src\/app-shell\//,
        "12.3.2": /^src\/app\/(?:login|reset-password)\//,
      }[owner];
      if (ownerRoot) components = currentFiles.filter((candidate) => ownerRoot.test(candidate));
      if (templateRouteValues.includes("*") && !components.length && currentFiles.includes("src/app/not-found.tsx")) {
        components = ["src/app/not-found.tsx"];
      }
    }
    return {
      templateRoutes: templateRouteValues,
      currentRoutes: matching.map((item) => ({ route: item.route, routeKind: item.routeKind, path: item.path })).sort((a, b) => stable(a).localeCompare(stable(b))),
      currentComponents: components,
    };
  };
}
async function templateRouteEntries() {
  const appPath = `${templateRoot}/src/App.tsx`;
  const text = await readFile(absolute(appPath), "utf8");
  const sourceFile = sourceFileFor(appPath, text);
  const imports = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const resolved = await resolveImport(appPath, statement.moduleSpecifier.text);
    if (!resolved) continue;
    if (statement.importClause.name) imports.set(statement.importClause.name.text, resolved);
    if (statement.importClause.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) for (const element of statement.importClause.namedBindings.elements) imports.set(element.name.text, resolved);
  }
  return (await templateRoutes()).map((entry) => ({ ...entry, sourcePath: imports.get(entry.component) ?? null }));
}
function evidenceFixture(kind, file, source, target, fixtureImports) {
  return {
    id: `fixture:${sha256(`${kind}:${file}:${source.line}:${source.expressionSha256}`).slice(0, 20)}`,
    sourceSnapshot: `${file}@${source.sha256}#L${source.line}:${source.expressionSha256}`,
    templateRoutes: target.templateRoutes,
    currentSurfacePaths: [...target.currentRoutes.map((item) => item.path), ...target.currentComponents].sort(),
    mockFixtureImports: fixtureImports,
    clock: "fixed fixture clock",
  };
}
async function semanticObligations(graph, currentRoutes) {
  const records = { "authored-class-occurrence": [], state: [], interaction: [] };
  const currentFiles = (await filesUnder("src")).filter((file) => /\.(?:css|ts|tsx)$/.test(file));
  const targetFor = currentTargetContext(graph, await templateRouteEntries(), currentRoutes, currentFiles);
  for (const file of graph.reachableFiles) {
    if (!/\.tsx?$/.test(file.path)) continue;
    const text = await readFile(absolute(file.path), "utf8");
    const sourceFile = sourceFileFor(file.path, text);
    const declarations = handlerDeclarations(sourceFile);
    const setters = stateSetters(sourceFile);
    const fixtureImports = importedFixtureNames(sourceFile);
    const occurrences = { "authored-class-occurrence": 0, state: 0, interaction: 0 };
    const visit = (node) => {
      let kind = null; let semantics = null;
      if (ts.isJsxAttribute(node) && node.name.text === "className") {
        kind = "authored-class-occurrence";
        const initializer = node.initializer;
        semantics = { classExpression: initializer ? exactText(sourceFile, initializer) : "true", classValue: initializer && ts.isStringLiteral(initializer) ? initializer.text : null, expressionForm: initializer && ts.isStringLiteral(initializer) ? "string-literal" : "jsx-expression" };
      } else if (ts.isCallExpression(node) && exactText(sourceFile, node.expression) === "useState") {
        kind = "state"; semantics = stateSemantics(sourceFile, node);
      } else if (ts.isJsxAttribute(node) && /^on(?:Click|Change|Submit|KeyDown|Blur|Focus)$/.test(node.name.text)) {
        kind = "interaction"; semantics = interactionSemantics(sourceFile, node, declarations, setters);
      }
      if (kind) {
        occurrences[kind] += 1;
        const idKind = kind === "authored-class-occurrence" ? "authored-class" : kind;
        const expression = exactText(sourceFile, node);
        const source = { ...file, line: lineFor(sourceFile, node), expressionSha256: sha256(expression) };
        const target = targetFor(file.path);
        records[kind].push({ id: obligationId(idKind, file.path, `:${occurrences[kind]}`), source, semantics, target, fixture: evidenceFixture(kind, file.path, source, target, fixtureImports) });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  for (const kind of Object.keys(records)) records[kind].sort((a, b) => a.id.localeCompare(b.id));
  return records;
}
async function extractedObligations(graph) {
  const records = { "reachable-component": [], asset: [], locale: [], theme: [] };
  for (const file of graph.reachableFiles) records["reachable-component"].push({ id: obligationId("reachable-component", file.path), source: file });
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

async function currentRouteInventory() {
  const currentFiles = (await filesUnder(currentRoot)).filter((file) => /\/(?:page|loading|error)\.tsx$/.test(file));
  return Promise.all(currentFiles.map(async (file) => ({ ...routeFor(file), sha256: await hashFile(file) })));
}
const semanticKinds = new Set(["authored-class-occurrence", "state", "interaction"]);
function currentRouteKey(route) { return stable({ route: route.route, routeKind: route.routeKind }); }
function exactCurrentRouteKey(route) { return stable({ path: route.source?.path ?? route.path, route: route.route, routeKind: route.routeKind }); }
function refreshCurrentRouteSources(records, currentRoutes) {
  const routeRecords = records.filter((record) => record.kind === "current-route");
  const duplicateIds = routeRecords.filter((record, index) => routeRecords.findIndex((candidate) => candidate.id === record.id) !== index);
  if (duplicateIds.length) throw new Error(`PARITY_CURRENT_ROUTE_REFRESH_DUPLICATE id=${duplicateIds[0].id}`);

  const usedRecordIds = new Set();
  const refreshedById = new Map();
  for (const current of currentRoutes) {
    const exactMatches = routeRecords.filter((record) => exactCurrentRouteKey(record) === exactCurrentRouteKey(current));
    if (exactMatches.length > 1) throw new Error(`PARITY_CURRENT_ROUTE_REFRESH_DUPLICATE identity=${exactCurrentRouteKey(current)}`);
    const routeMatches = routeRecords.filter((record) => currentRouteKey(record) === currentRouteKey(current));
    const match = exactMatches[0] ?? (routeMatches.length === 1 ? routeMatches[0] : null);
    if (!match) {
      const code = routeMatches.length > 1 ? "AMBIGUOUS" : "MISSING";
      throw new Error(`PARITY_CURRENT_ROUTE_REFRESH_${code} identity=${exactCurrentRouteKey(current)} candidates=${routeMatches.length}`);
    }
    if (usedRecordIds.has(match.id)) throw new Error(`PARITY_CURRENT_ROUTE_REFRESH_DUPLICATE record=${match.id}`);
    usedRecordIds.add(match.id);
    refreshedById.set(match.id, {
      ...match,
      source: { ...match.source, path: current.path, sha256: current.sha256 },
    });
  }
  const unmatched = routeRecords.filter((record) => !usedRecordIds.has(record.id));
  if (unmatched.length) throw new Error(`PARITY_CURRENT_ROUTE_REFRESH_MISSING_INVENTORY record=${unmatched[0].id} identity=${exactCurrentRouteKey(unmatched[0])}`);
  return records.map((record) => refreshedById.get(record.id) ?? record);
}
function protectedRefreshFields(record) {
  return {
    id: record.id,
    kind: record.kind,
    target: record.target,
    laterOwner: record.laterOwner,
    disposition: record.disposition,
    reason: record.reason,
    evidence: record.evidence,
    evidenceTarget: record.evidenceTarget,
  };
}
function currentRouteWithoutRefreshableSource(record) {
  const copy = structuredClone(record);
  if (copy.source) {
    delete copy.source.path;
    delete copy.source.sha256;
  }
  return copy;
}
function compatibleProtectedFields(original, refreshed) {
  const mutableForSemantic = new Set(["target", "fixture", "evidence"]);
  for (const key of Object.keys(protectedRefreshFields(original))) {
    if (original[key] === undefined) continue;
    if (semanticKinds.has(original.kind) && mutableForSemantic.has(key)) continue;
    if (!sameObjects(original[key], refreshed[key])) return false;
  }
  return true;
}
function assertRefreshInvariants(before, after) {
  if (before.length !== after.length) throw new Error(`PARITY_REFRESH_INVARIANT_RECORD_COUNT before=${before.length} after=${after.length}`);
  const beforeById = new Map(before.map((record) => [record.id, record]));
  const afterById = new Map(after.map((record) => [record.id, record]));
  if (beforeById.size !== before.length || afterById.size !== after.length) throw new Error("PARITY_REFRESH_INVARIANT_DUPLICATE_ID obligations");
  for (const [id, original] of beforeById) {
    const refreshed = afterById.get(id);
    if (!refreshed) throw new Error(`PARITY_REFRESH_INVARIANT_ID_MISSING ${id}`);
    if (!compatibleProtectedFields(original, refreshed)) throw new Error(`PARITY_REFRESH_INVARIANT_PROTECTED ${id}`);
    if (original.kind === "current-route") {
      if (!sameObjects(currentRouteWithoutRefreshableSource(original), currentRouteWithoutRefreshableSource(refreshed))) throw new Error(`PARITY_REFRESH_INVARIANT_CURRENT_ROUTE ${id}`);
    } else if (!semanticKinds.has(original.kind) && !sameObjects(original, refreshed)) {
      throw new Error(`PARITY_REFRESH_INVARIANT_FAMILY ${id}`);
    }
  }
  for (const id of afterById.keys()) if (!beforeById.has(id)) throw new Error(`PARITY_REFRESH_INVARIANT_ID_ADDED ${id}`);
}
function compareSemanticField(failures, code, record, expected, select) {
  if (!sameObjects(select(record), select(expected))) fail(failures, code, record.id);
}
function validateSemanticObligations(failures, expectedByKind, records) {
  for (const [kind, expectedRecords] of Object.entries(expectedByKind)) {
    const label = kind === "authored-class-occurrence" ? "AUTHORED_CLASS" : kind.toUpperCase();
    const actualRecords = records.filter((record) => record.kind === kind);
    const expectedById = new Map(expectedRecords.map((record) => [record.id, record]));
    const actualById = new Map(actualRecords.map((record) => [record.id, record]));
    for (const id of [...expectedById.keys()].filter((id) => !actualById.has(id)).sort()) fail(failures, `${label}_MISSING`, id);
    for (const id of [...actualById.keys()].filter((id) => !expectedById.has(id)).sort()) fail(failures, `${label}_STALE`, id);
    for (const [id, expected] of expectedById) {
      const record = actualById.get(id);
      if (!record) continue;
      compareSemanticField(failures, `${label}_SOURCE_INVALID`, record, expected, (item) => item.source);
      compareSemanticField(failures, `${label}_TARGET_INVALID`, record, expected, (item) => item.target);
      compareSemanticField(failures, `${label}_FIXTURE_INVALID`, record, expected, (item) => item.fixture);
      const concreteTargets = [...(record.target?.currentRoutes ?? []), ...(record.target?.currentComponents ?? [])];
      if (!concreteTargets.length || !record.fixture?.id || !record.fixture?.sourceSnapshot || !(record.fixture?.currentSurfacePaths?.length > 0)) fail(failures, `${label}_EVIDENCE_IDENTITY_INVALID`, id);
      if (kind === "authored-class-occurrence") {
        compareSemanticField(failures, "AUTHORED_CLASS_EXPRESSION_INVALID", record, expected, (item) => item.semantics?.classExpression);
        compareSemanticField(failures, "AUTHORED_CLASS_VALUE_INVALID", record, expected, (item) => ({ value: item.semantics?.classValue, form: item.semantics?.expressionForm }));
        if (typeof record.semantics?.classExpression !== "string" || !record.semantics.classExpression.trim()) fail(failures, "AUTHORED_CLASS_EXPRESSION_INVALID", id);
      } else if (kind === "state") {
        compareSemanticField(failures, "STATE_NAME_INVALID", record, expected, (item) => ({ name: item.semantics?.name, setter: item.semantics?.setter }));
        compareSemanticField(failures, "STATE_OWNER_SCOPE_INVALID", record, expected, (item) => item.semantics?.ownerScope);
        compareSemanticField(failures, "STATE_INITIAL_INVALID", record, expected, (item) => item.semantics?.initialValue);
        compareSemanticField(failures, "STATE_TRIGGER_INVALID", record, expected, (item) => item.semantics?.trigger);
        compareSemanticField(failures, "STATE_EXPECTED_VIEW_INVALID", record, expected, (item) => item.semantics?.expectedView);
        if (typeof record.semantics?.name !== "string" || !record.semantics.name.trim() || record.semantics.name === "unbound-useState" || typeof record.semantics?.initialValue !== "string" || !record.semantics.initialValue.trim()) fail(failures, "STATE_NAME_INVALID", id);
        if (!record.semantics?.ownerScope?.id || !record.semantics?.ownerScope?.name || !Number.isInteger(record.semantics?.ownerScope?.startLine) || !Number.isInteger(record.semantics?.ownerScope?.endLine)) fail(failures, "STATE_OWNER_SCOPE_INVALID", id);
        if (!Array.isArray(record.semantics?.trigger?.transitions) || typeof record.semantics?.trigger?.initializationOnly !== "boolean") fail(failures, "STATE_TRIGGER_INVALID", id);
        if (!/^(?:direct-jsx|derived-read|render-invalidation-only|indirect-read|write-only)$/.test(record.semantics?.expectedView?.mode ?? "") || !Array.isArray(record.semantics?.expectedView?.jsxBindings) || !Array.isArray(record.semantics?.expectedView?.derivedReads) || !Array.isArray(record.semantics?.expectedView?.readSites)) fail(failures, "STATE_EXPECTED_VIEW_INVALID", id);
      } else {
        compareSemanticField(failures, "INTERACTION_EVENT_INVALID", record, expected, (item) => item.semantics?.event);
        compareSemanticField(failures, "INTERACTION_ACTION_INVALID", record, expected, (item) => item.semantics?.action);
        compareSemanticField(failures, "INTERACTION_FEEDBACK_INVALID", record, expected, (item) => item.semantics?.feedback);
        if (!/^(?:click|change|submit|keyDown|blur|focus)$/.test(record.semantics?.event ?? "") || !record.semantics?.action?.handlerExpression || !record.semantics?.action?.implementation) fail(failures, "INTERACTION_ACTION_INVALID", id);
        if (!/^(?:effect-calls|delegated-callback|effect-free-expression)$/.test(record.semantics?.feedback?.mode ?? "") || !Array.isArray(record.semantics?.feedback?.effects) || typeof record.semantics?.feedback?.effectFree !== "boolean") fail(failures, "INTERACTION_FEEDBACK_INVALID", id);
      }
    }
  }
}
function validateDynamicTargetCoverage(failures, records, currentRoutes) {
  const semanticKinds = new Set(["authored-class-occurrence", "state", "interaction"]);
  const concreteRoute = (route) => route.replace(/:([A-Za-z0-9_]+)/g, "[$1]");
  for (const record of records.filter((item) => semanticKinds.has(item.kind))) {
    for (const templateRoute of (record.target?.templateRoutes ?? []).filter((route) => /:[A-Za-z0-9_]+/.test(route))) {
      const currentRoute = concreteRoute(templateRoute);
      for (const currentSurface of currentRoutes.filter((item) => item.route === currentRoute)) {
        if (!(record.target?.currentRoutes ?? []).some((item) => item.route === currentRoute && item.routeKind === currentSurface.routeKind && item.path === currentSurface.path)) {
          fail(failures, "DYNAMIC_TARGET_MISSING", `${record.id} template=${templateRoute} current=${currentRoute} path=${currentSurface.path}`);
        }
      }
    }
  }
}
function validateStateLexicalIsolation(failures, records) {
  const states = records.filter((record) => record.kind === "state");
  for (const record of states) {
    const scope = record.semantics?.ownerScope;
    if (!scope) continue;
    const outside = (line) => !Number.isInteger(line) || line < scope.startLine || line > scope.endLine;
    for (const transition of record.semantics?.trigger?.transitions ?? []) {
      if (outside(transition.line)) fail(failures, "STATE_LEXICAL_TRANSITION_LEAK", `${record.id} owner=${scope.name} line=${transition.line}`);
    }
    for (const field of ["jsxBindings", "derivedReads", "readSites"]) {
      for (const view of record.semantics?.expectedView?.[field] ?? []) {
        if (outside(view.line)) fail(failures, "STATE_LEXICAL_VIEW_LEAK", `${record.id} owner=${scope.name} field=${field} line=${view.line}`);
      }
    }
  }
  const accountSaving = states.filter((record) => record.source?.path === "docs/template/app/src/pages/admin/AdminAccountDetail.tsx" && record.semantics?.name === "saving");
  const expectedOwners = ["AccessTab", "IdentityTab", "PreferencesTab", "StorefrontTab"];
  const actualOwners = accountSaving.map((record) => record.semantics?.ownerScope?.name).sort();
  if (accountSaving.length !== 4 || !sameObjects(actualOwners, expectedOwners)) fail(failures, "STATE_DUPLICATE_OWNER_SCOPE_INVALID", `AdminAccountDetail.saving owners=${stable(actualOwners)}`);
  const scopeIds = new Set(accountSaving.map((record) => record.semantics?.ownerScope?.id));
  if (scopeIds.size !== accountSaving.length) fail(failures, "STATE_DUPLICATE_OWNER_SCOPE_INVALID", "AdminAccountDetail.saving scope IDs are not distinct");
}

async function refreshSemanticContract() {
  const manifestPath = "docs/frontend-template-parity/manifest.json";
  const obligationsPath = "docs/frontend-template-parity/obligations.ndjson";
  const manifest = JSON.parse(await readFile(absolute(manifestPath), "utf8"));
  const originalRaw = await readFile(absolute(obligationsPath), "utf8");
  const records = originalRaw.trim().split("\n").map((line) => JSON.parse(line));
  if (manifest.obligations?.path !== obligationsPath || manifest.obligations?.count !== records.length || manifest.obligations?.sha256 !== sha256(originalRaw)) {
    throw new Error("PARITY_REFRESH_MANIFEST_BINDING_INVALID manifest obligations");
  }
  const failures = [];
  const graph = await templateGraph(failures);
  if (failures.length) throw new Error(failures.join("\n"));
  const currentRoutes = await currentRouteInventory();
  const semantic = await semanticObligations(graph, currentRoutes);
  const regenerated = Object.entries(semantic).flatMap(([kind, expectedRecords]) => expectedRecords.map((derived) => ({
    ...derived,
    kind,
    disposition: kind === "authored-class-occurrence" ? "presentation-reference" : "presentation-and-feedback-reference",
    laterOwner: ownerForSource(derived.source.path),
    evidenceTarget: kind === "authored-class-occurrence" ? "interactive" : "all-states",
  })));
  const routeRefreshedRecords = refreshCurrentRouteSources(records, currentRoutes);
  const nextRecords = [...routeRefreshedRecords.filter((record) => !semanticKinds.has(record.kind)), ...regenerated].sort((a, b) => a.id.localeCompare(b.id));
  assertRefreshInvariants(records, nextRecords);
  const raw = `${nextRecords.map((record) => JSON.stringify(record)).join("\n")}\n`;
  const nextManifest = structuredClone(manifest);
  nextManifest.obligations = { path: obligationsPath, count: nextRecords.length, sha256: sha256(raw) };
  await writeFile(absolute(obligationsPath), raw);
  await writeFile(absolute(manifestPath), `${JSON.stringify(nextManifest, null, 2)}\n`);
  return { records: nextRecords.length, semanticRecords: regenerated.length, currentRoutes: currentRoutes.length };
}

async function runSemanticMutationProbes() {
  const obligationsPath = "docs/frontend-template-parity/obligations.ndjson";
  const originalRaw = await readFile(absolute(obligationsPath), "utf8");
  const originalRecords = originalRaw.trim().split("\n").map((line) => JSON.parse(line));
  const graphFailures = [];
  const graph = await templateGraph(graphFailures);
  if (graphFailures.length) throw new Error(graphFailures.join("\n"));
  const currentRoutes = await currentRouteInventory();
  const expectedByKind = await semanticObligations(graph, currentRoutes);
  const literalClass = originalRecords.find((record) => record.kind === "authored-class-occurrence" && record.semantics?.classValue !== null);
  const mixedCatalogClass = originalRecords.find((record) => record.kind === "authored-class-occurrence" && record.source?.path === "docs/template/app/src/pages/catalog/fields.tsx");
  const accountSaving = originalRecords.filter((record) => record.kind === "state" && record.source?.path === "docs/template/app/src/pages/admin/AdminAccountDetail.tsx" && record.semantics?.name === "saving");
  const savingByOwner = new Map(accountSaving.map((record) => [record.semantics?.ownerScope?.name, record]));
  const first = (kind) => originalRecords.find((record) => record.kind === kind);
  const cases = [
    ["class-expression", "AUTHORED_CLASS_EXPRESSION_INVALID", (records) => { firstIn(records, first("authored-class-occurrence").id).semantics.classExpression = "removed"; }],
    ["class-value", "AUTHORED_CLASS_VALUE_INVALID", (records) => { firstIn(records, literalClass.id).semantics.classValue = "removed"; }],
    ["class-record", "AUTHORED_CLASS_MISSING", (records) => removeFrom(records, first("authored-class-occurrence").id)],
    ["state-name", "STATE_NAME_INVALID", (records) => { delete firstIn(records, first("state").id).semantics.name; }],
    ["state-owner-scope", "STATE_OWNER_SCOPE_INVALID", (records) => { delete firstIn(records, first("state").id).semantics.ownerScope; }],
    ["state-initial", "STATE_INITIAL_INVALID", (records) => { delete firstIn(records, first("state").id).semantics.initialValue; }],
    ["state-trigger", "STATE_TRIGGER_INVALID", (records) => { delete firstIn(records, first("state").id).semantics.trigger; }],
    ["state-view", "STATE_EXPECTED_VIEW_INVALID", (records) => { delete firstIn(records, first("state").id).semantics.expectedView; }],
    ["state-record", "STATE_MISSING", (records) => removeFrom(records, first("state").id)],
    ["interaction-event", "INTERACTION_EVENT_INVALID", (records) => { delete firstIn(records, first("interaction").id).semantics.event; }],
    ["interaction-action", "INTERACTION_ACTION_INVALID", (records) => { delete firstIn(records, first("interaction").id).semantics.action; }],
    ["interaction-feedback", "INTERACTION_FEEDBACK_INVALID", (records) => { delete firstIn(records, first("interaction").id).semantics.feedback; }],
    ["interaction-record", "INTERACTION_MISSING", (records) => removeFrom(records, first("interaction").id)],
    ["exact-target", "AUTHORED_CLASS_TARGET_INVALID", (records) => { firstIn(records, first("authored-class-occurrence").id).target.currentRoutes = []; firstIn(records, first("authored-class-occurrence").id).target.currentComponents = []; }],
    ["fixture-identity", "AUTHORED_CLASS_FIXTURE_INVALID", (records) => { delete firstIn(records, first("authored-class-occurrence").id).fixture.id; }],
    ["mixed-dynamic-target", "DYNAMIC_TARGET_MISSING", (records) => { const record = firstIn(records, mixedCatalogClass.id); record.target.currentRoutes = record.target.currentRoutes.filter((item) => item.path !== "src/app/(merchant)/catalog/products/[id]/page.tsx"); }],
    ["sibling-state-transition", "STATE_LEXICAL_TRANSITION_LEAK", (records) => { const target = firstIn(records, savingByOwner.get("IdentityTab").id); target.semantics.trigger.transitions.push(structuredClone(savingByOwner.get("AccessTab").semantics.trigger.transitions[0])); }],
    ["sibling-state-view", "STATE_LEXICAL_VIEW_LEAK", (records) => { const target = firstIn(records, savingByOwner.get("IdentityTab").id); target.semantics.expectedView.jsxBindings.push(structuredClone(savingByOwner.get("AccessTab").semantics.expectedView.jsxBindings[0])); }],
  ];
  function firstIn(records, id) { return records.find((record) => record.id === id); }
  function removeFrom(records, id) { records.splice(records.findIndex((record) => record.id === id), 1); }
  for (const [name, expectedCode, mutate] of cases) {
    const records = originalRecords.map((record) => structuredClone(record));
    mutate(records);
    const failures = [];
    validateSemanticObligations(failures, expectedByKind, records);
    validateDynamicTargetCoverage(failures, records, currentRoutes);
    validateStateLexicalIsolation(failures, records);
    if (!failures.some((failure) => failure.startsWith(`PARITY_${expectedCode} `))) throw new Error(`PARITY_MUTATION_PROBE_WRONG_DIAGNOSTIC ${name} expected=PARITY_${expectedCode}\n${failures.join("\n")}`);
    console.log(`FRONTEND_PARITY_MUTATION_OK ${name}=PARITY_${expectedCode}`);
  }
  const expectRefreshFailure = (name, expectedCode, run) => {
    try { run(); } catch (error) {
      if (!error.message.startsWith(`PARITY_${expectedCode} `)) throw new Error(`PARITY_MUTATION_PROBE_WRONG_DIAGNOSTIC ${name} expected=PARITY_${expectedCode}\n${error.message}`);
      console.log(`FRONTEND_PARITY_MUTATION_OK ${name}=PARITY_${expectedCode}`);
      return;
    }
    throw new Error(`PARITY_MUTATION_PROBE_NOT_REJECTED ${name} expected=PARITY_${expectedCode}`);
  };
  const route = currentRoutes[0];
  const routeRecord = originalRecords.find((record) => record.kind === "current-route" && exactCurrentRouteKey(record) === exactCurrentRouteKey(route));
  if (!routeRecord) throw new Error(`PARITY_MUTATION_PROBE_FIXTURE_MISSING route=${exactCurrentRouteKey(route)}`);
  const staleRouteRecords = originalRecords.map((record) => structuredClone(record));
  staleRouteRecords.find((record) => record.id === routeRecord.id).source.sha256 = "0".repeat(64);
  const refreshedRouteRecords = refreshCurrentRouteSources(staleRouteRecords, currentRoutes);
  const refreshedRoute = refreshedRouteRecords.find((record) => record.id === routeRecord.id);
  if (refreshedRoute.source.sha256 !== route.sha256) throw new Error("PARITY_MUTATION_PROBE_NOT_REFRESHED current-route-source");
  assertRefreshInvariants(staleRouteRecords, refreshedRouteRecords);
  console.log("FRONTEND_PARITY_MUTATION_OK current-route-stale-source=REFRESHED");

  const missingRouteRecords = originalRecords.filter((record) => record.id !== routeRecord.id);
  expectRefreshFailure("current-route-missing", "CURRENT_ROUTE_REFRESH_MISSING", () => refreshCurrentRouteSources(missingRouteRecords, currentRoutes));
  const duplicateRouteRecords = [...originalRecords, { ...structuredClone(routeRecord), id: `${routeRecord.id}:duplicate` }];
  expectRefreshFailure("current-route-duplicate", "CURRENT_ROUTE_REFRESH_DUPLICATE", () => refreshCurrentRouteSources(duplicateRouteRecords, currentRoutes));
  const ambiguousRecords = [
    { id: "current-route:probe-a", kind: "current-route", source: { path: "src/app/probe-a/page.tsx", sha256: "a" }, route: "/probe", routeKind: "page" },
    { id: "current-route:probe-b", kind: "current-route", source: { path: "src/app/probe-b/page.tsx", sha256: "b" }, route: "/probe", routeKind: "page" },
  ];
  const ambiguousInventory = [{ path: "src/app/probe/page.tsx", sha256: "c", route: "/probe", routeKind: "page" }];
  expectRefreshFailure("current-route-ambiguous", "CURRENT_ROUTE_REFRESH_AMBIGUOUS", () => refreshCurrentRouteSources(ambiguousRecords, ambiguousInventory));
  const tamperedRefresh = refreshedRouteRecords.map((record) => structuredClone(record));
  tamperedRefresh.find((record) => record.id === routeRecord.id).target = { route: "/tampered", surface: "src/app/tampered/page.tsx" };
  expectRefreshFailure("refresh-invariant-tamper", "REFRESH_INVARIANT_PROTECTED", () => assertRefreshInvariants(staleRouteRecords, tamperedRefresh));
  return { probes: cases.length + 5 };
}

export async function checkFrontendTemplateParity() {
  const failures = [];
  let manifest; let records;
  try { manifest = JSON.parse(await readFile(absolute("docs/frontend-template-parity/manifest.json"), "utf8")); } catch { fail(failures, "MANIFEST_INVALID", "docs/frontend-template-parity/manifest.json"); }
  let raw = "";
  try { raw = await readFile(absolute("docs/frontend-template-parity/obligations.ndjson"), "utf8"); records = raw.endsWith("\n") ? raw.slice(0, -1).split("\n").map((line, index) => { try { return JSON.parse(line); } catch { fail(failures, "NDJSON_INVALID", `line=${index + 1}`); return null; } }).filter(Boolean) : []; if (!raw.endsWith("\n")) fail(failures, "NDJSON_NEWLINE_MISSING", "obligations.ndjson"); } catch { records = []; fail(failures, "NDJSON_MISSING", "obligations.ndjson"); }
  if (!manifest) throw new Error(failures.join("\n"));
  if (manifest.schemaVersion !== 2) fail(failures, "SCHEMA_VERSION", String(manifest.schemaVersion));
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
  const currentRoutes = await currentRouteInventory();
  validateSemanticObligations(failures, await semanticObligations(graph, currentRoutes), records);
  validateDynamicTargetCoverage(failures, records, currentRoutes);
  validateStateLexicalIsolation(failures, records);
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
  const routeKey = (item) => stable({ path: item.path, sha256: item.sha256, route: item.route, routeKind: item.routeKind });
  const mappedRoutes = records.filter((record) => record.kind === "current-route").map((record) => ({ path: record.source?.path, sha256: record.source?.sha256, route: record.route, routeKind: record.routeKind }));
  compareSet(failures, "CURRENT_ROUTE", currentRoutes, mappedRoutes, routeKey);
  const counts = Object.fromEntries([...kinds].sort().map((kind) => [kind, records.filter((record) => record.kind === kind).length]));
  if (failures.length) throw new Error(failures.sort().join("\n"));
  return { records: records.length, reachableFiles: graph.reachableFiles.length, importEdges: graph.edges.length, currentRoutes: currentRoutes.length, counts };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (process.argv.includes("--refresh-semantic-contract")) {
      const result = await refreshSemanticContract();
      console.log(`FRONTEND_PARITY_REFRESH_OK records=${result.records} semantic_records=${result.semanticRecords} current_routes=${result.currentRoutes}`);
    } else if (process.argv.includes("--semantic-mutation-probes")) {
      const result = await runSemanticMutationProbes();
      console.log(`FRONTEND_PARITY_MUTATIONS_OK probes=${result.probes}`);
    } else {
      const result = await checkFrontendTemplateParity();
      console.log(`FRONTEND_PARITY_OK records=${result.records} reachable_files=${result.reachableFiles} import_edges=${result.importEdges} current_routes=${result.currentRoutes}`);
      for (const [kind, count] of Object.entries(result.counts)) console.log(`FRONTEND_PARITY_COUNT ${kind}=${count}`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
