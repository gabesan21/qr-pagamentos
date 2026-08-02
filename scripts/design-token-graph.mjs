const TOKEN_TYPES = new Set([
  "color", "dimension", "fontFamily", "fontWeight", "duration", "cubicBezier", "number",
  "strokeStyle", "border", "shadow", "gradient", "typography", "transition",
]);

export function hexToSrgb(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid six-digit hex: ${hex}`);
  return hex.slice(1).match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255);
}

export function hexFromSrgb(components) {
  if (!Array.isArray(components) || components.length !== 3 || components.some((value) => typeof value !== "number" || value < 0 || value > 1))
    throw new Error(`Out-of-sRGB components: ${JSON.stringify(components)}`);
  return `#${components.map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function relativeLuminance(hex) {
  const linear = hexToSrgb(hex).map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function tokenNodeAt(root, path) {
  let node = path.split(".").reduce((value, segment) => value?.[segment], root);
  if (node && !("$value" in node) && node.$root) node = node.$root;
  return node;
}

function resolveValue(root, value, stack) {
  const alias = typeof value === "string" ? value.match(/^\{([^{}]+)\}$/) : null;
  if (alias) return resolveToken(root, alias[1], stack);
  if (Array.isArray(value)) return value.map((entry) => resolveValue(root, entry, stack));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, resolveValue(root, entry, stack)]));
  return value;
}

export function resolveToken(root, path, stack = []) {
  if (stack.includes(path)) throw new Error(`Token reference cycle: ${[...stack, path].join(" -> ")}`);
  const node = tokenNodeAt(root, path);
  if (!node || !("$value" in node)) throw new Error(`Unresolved token reference: ${path}`);
  return resolveValue(root, node.$value, [...stack, path]);
}

function decodePointer(pointer) {
  return pointer.replace(/^\//, "").split("/").filter(Boolean)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

export function resolveExternalRef(documents, reference) {
  const [file, pointer = ""] = reference.split("#");
  const document = documents[file || "$root"];
  if (!document) throw new Error(`Unresolved token document: ${file || "$root"}`);
  const value = decodePointer(pointer).reduce((node, segment) => node?.[segment], document);
  if (value === undefined) throw new Error(`Unresolved resolver reference: ${reference}`);
  return value;
}

function mergeTokenSources(target, source) {
  if (Array.isArray(source) || source === null || typeof source !== "object") return structuredClone(source);
  const merged = target && !Array.isArray(target) && typeof target === "object" ? structuredClone(target) : {};
  for (const [key, value] of Object.entries(source)) {
    merged[key] = value && !Array.isArray(value) && typeof value === "object"
      ? mergeTokenSources(merged[key], value)
      : structuredClone(value);
  }
  return merged;
}

function resolverTarget(resolver, reference) {
  const match = reference.match(/^#\/(sets|modifiers)\/([^/]+)$/);
  if (!match) throw new Error(`Invalid resolution-order reference: ${reference}`);
  const [, collection, name] = match;
  const target = resolver[collection]?.[name];
  if (!target) throw new Error(`Unresolved resolution-order reference: ${reference}`);
  return { collection, name, target };
}

function selectedContexts(resolver, inputs) {
  const normalizedInputs = new Map(Object.entries(inputs).map(([name, value]) => [name.toLowerCase(), value]));
  for (const name of normalizedInputs.keys()) {
    if (!Object.keys(resolver.modifiers ?? {}).some((modifier) => modifier.toLowerCase() === name))
      throw new Error(`Unknown resolver modifier input: ${name}`);
  }
  return Object.fromEntries(Object.entries(resolver.modifiers ?? {}).map(([name, modifier]) => {
    if (!modifier.contexts || typeof modifier.contexts !== "object") throw new Error(`Modifier ${name} has no contexts.`);
    const requested = normalizedInputs.get(name.toLowerCase());
    if (requested !== undefined && typeof requested !== "string") throw new Error(`Modifier input ${name} must be a string.`);
    const contextName = requested ?? modifier.default;
    if (contextName === undefined) throw new Error(`Modifier ${name} requires an input.`);
    const canonicalName = Object.keys(modifier.contexts).find((candidate) => candidate.toLowerCase() === contextName.toLowerCase());
    if (!canonicalName) throw new Error(`Unknown ${name} context: ${contextName}`);
    return [name, canonicalName];
  }));
}

function resolvedTokenTree(root) {
  const resolved = structuredClone(root);
  function visit(node, path = []) {
    if (!node || typeof node !== "object") return;
    if ("$value" in node) {
      node.$value = resolveToken(root, path.join("."));
      return;
    }
    for (const [name, child] of Object.entries(node)) {
      if (!name.startsWith("$") || name === "$root") visit(child, [...path, name]);
    }
  }
  visit(resolved);
  return resolved;
}

function assertDimension(value, path, units) {
  if (!value || typeof value !== "object" || typeof value.value !== "number" || !units.has(value.unit))
    throw new Error(`${path}: invalid ${[...units].join("/")} value.`);
}

function validateValue(type, value, path) {
  switch (type) {
    case "color": {
      if (!value || value.colorSpace !== "srgb" || !Array.isArray(value.components) || value.components.length !== 3)
        throw new Error(`${path}: color must be normalized sRGB.`);
      if (value.components.some((component) => typeof component !== "number" || component < 0 || component > 1))
        throw new Error(`${path}: color is outside sRGB gamut.`);
      if (!/^#[0-9a-f]{6}$/.test(value.hex) || hexFromSrgb(value.components) !== value.hex)
        throw new Error(`${path}: sRGB components and hex fallback differ.`);
      if (value.alpha !== undefined && (typeof value.alpha !== "number" || value.alpha < 0 || value.alpha > 1))
        throw new Error(`${path}: invalid alpha.`);
      break;
    }
    case "dimension": assertDimension(value, path, new Set(["px", "rem"])); break;
    case "duration": assertDimension(value, path, new Set(["ms", "s"])); break;
    case "fontFamily":
      if (!(typeof value === "string" || (Array.isArray(value) && value.length > 0 && value.every((part) => typeof part === "string"))))
        throw new Error(`${path}: invalid font family.`);
      break;
    case "fontWeight":
      if (!(typeof value === "number" && value >= 1 && value <= 1000)) throw new Error(`${path}: invalid font weight.`);
      break;
    case "number": if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path}: invalid number.`); break;
    case "cubicBezier":
      if (!Array.isArray(value) || value.length !== 4 || value.some((part) => typeof part !== "number") || value[0] < 0 || value[0] > 1 || value[2] < 0 || value[2] > 1)
        throw new Error(`${path}: invalid cubicBezier.`);
      break;
    case "shadow": {
      const shadows = Array.isArray(value) ? value : [value];
      if (shadows.length === 0) throw new Error(`${path}: empty shadow.`);
      for (const shadow of shadows) {
        validateValue("color", shadow.color, `${path}.color`);
        for (const member of ["offsetX", "offsetY", "blur", "spread"]) assertDimension(shadow[member], `${path}.${member}`, new Set(["px", "rem"]));
        if (typeof shadow.inset !== "boolean") throw new Error(`${path}: shadow inset must be boolean.`);
      }
      break;
    }
    case "typography": {
      if (!value || typeof value !== "object") throw new Error(`${path}: invalid typography.`);
      validateValue("fontFamily", value.fontFamily, `${path}.fontFamily`);
      assertDimension(value.fontSize, `${path}.fontSize`, new Set(["px", "rem"]));
      validateValue("fontWeight", value.fontWeight, `${path}.fontWeight`);
      assertDimension(value.letterSpacing, `${path}.letterSpacing`, new Set(["px", "rem"]));
      assertDimension(value.lineHeight, `${path}.lineHeight`, new Set(["px", "rem"]));
      break;
    }
    default: throw new Error(`${path}: unsupported token type ${type}.`);
  }
}

export function validateTokenTree(root) {
  const paths = [];
  function visit(node, path = [], inheritedType) {
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error(`${path.join(".")}: token/group must be an object.`);
    const ownType = node.$type ?? inheritedType;
    if (node.$type !== undefined && !TOKEN_TYPES.has(node.$type)) throw new Error(`${path.join(".")}: invalid token type ${node.$type}.`);
    if ("$value" in node) {
      if (!ownType) throw new Error(`${path.join(".")}: token has no resolvable type.`);
      validateValue(ownType, node.$value, path.join("."));
      paths.push(path.join("."));
      return;
    }
    for (const [name, child] of Object.entries(node)) {
      if (name.startsWith("$")) continue;
      if (name.includes(".") || /[{}]/.test(name)) throw new Error(`${[...path, name].join(".")}: invalid token/group name.`);
      visit(child, [...path, name], ownType);
    }
    if (node.$root) visit(node.$root, [...path, "$root"], ownType);
  }
  visit(root);
  return paths;
}

function validateTokenStructure(root) {
  function visit(node, path = [], inheritedType) {
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new Error(`${path.join(".")}: token/group must be an object.`);
    const ownType = node.$type ?? inheritedType;
    if (node.$type !== undefined && !TOKEN_TYPES.has(node.$type)) throw new Error(`${path.join(".")}: invalid token type ${node.$type}.`);
    if ("$value" in node && !ownType) throw new Error(`${path.join(".")}: token has no resolvable type.`);
    for (const [name, child] of Object.entries(node)) {
      if (name.startsWith("$") && name !== "$root") continue;
      if (!name.startsWith("$") && (name.includes(".") || /[{}]/.test(name)))
        throw new Error(`${[...path, name].join(".")}: invalid token/group name.`);
      if (name === "$root" || !("$value" in node)) visit(child, [...path, name], ownType);
    }
  }
  visit(root);
}

export function resolveDesignTokens(resolver, documents, inputs = {}) {
  if (resolver.version !== "2025.10") throw new Error("Resolver version must be 2025.10.");
  if (!Array.isArray(resolver.resolutionOrder)) throw new Error("Resolver resolutionOrder must be an array.");
  const allowed = new Set(["name", "version", "description", "sets", "modifiers", "resolutionOrder", "$extensions"]);
  const unsupported = Object.keys(resolver).find((name) => !allowed.has(name));
  if (unsupported) throw new Error(`Unsupported resolver property: ${unsupported}`);

  const contexts = selectedContexts(resolver, inputs);
  let merged = {};
  for (const entry of resolver.resolutionOrder) {
    if (!entry || typeof entry.$ref !== "string") throw new Error("Every resolution-order entry must contain a $ref.");
    const { collection, name, target } = resolverTarget(resolver, entry.$ref);
    const sources = collection === "sets" ? target.sources : target.contexts[contexts[name]];
    if (!Array.isArray(sources)) throw new Error(`Resolver target ${name} has no sources.`);
    for (const source of sources) {
      if (!source || typeof source.$ref !== "string") throw new Error(`Resolver target ${name} contains an invalid source.`);
      merged = mergeTokenSources(merged, resolveExternalRef(documents, source.$ref));
    }
  }
  validateTokenStructure(merged);
  const tokens = resolvedTokenTree(merged);
  validateTokenTree(tokens);
  return { contexts, tokens };
}
