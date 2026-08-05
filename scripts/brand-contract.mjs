import { createHash } from "node:crypto";

const requiredIdentityContract = Object.freeze({
  "mark-only": ["mark-positive", "mark-reversed"],
  "product-lockup": ["product-lockup-positive", "product-lockup-reversed"],
  "compact-role-lockup": ["compact-role-lockup-positive", "compact-role-lockup-reversed"],
  "merchant-fallback": ["merchant-fallback-positive", "merchant-fallback-reversed"],
});

export const requiredIdentityIds = Object.freeze(Object.keys(requiredIdentityContract));
export const requiredThemeIds = Object.freeze([
  "pix-paper",
  "cashier-daylight",
  "settlement-sand",
  "midnight-clearing",
  "vault-blue",
  "terminal-amber",
]);
const requiredSourceFiles = Object.freeze([
  "avatar-default.svg", "empty-links.svg", "empty-orders.svg",
  "empty-products.svg", "empty-users.svg", "logo.svg", "product-fallback.svg",
  "theme-swatch-cashier-daylight.svg", "theme-swatch-midnight-clearing.svg",
  "theme-swatch-pix-paper.svg", "theme-swatch-settlement-sand.svg",
  "theme-swatch-terminal-amber.svg", "theme-swatch-vault-blue.svg", "unavailable.svg",
]);
const requiredDerivativePaths = Object.freeze([
  ...Object.values(requiredIdentityContract).flat().map((id) => `public/brand/${id}.svg`),
  ...requiredSourceFiles.filter((file) => file !== "logo.svg").map((file) => `public/application-assets/${file}`),
  "public/brand/favicon-16.png", "public/brand/favicon-32.png", "public/brand/favicon-48.png",
  "src/app/favicon.ico",
]);

const allowedElements = new Set(["svg", "g", "defs", "path", "rect", "circle", "use"]);
const allowedAttributes = new Set([
  "xmlns", "xmlns:xlink", "viewBox", "width", "height", "fill", "fill-rule",
  "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "opacity", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy",
  "r", "d", "transform", "id", "href", "xlink:href", "data-brand-identity",
]);
const sourceTextAttributes = new Set(["font-family", "font-weight", "font-size", "letter-spacing"]);
const allowedColors = new Set([
  "none", "currentColor",
  "#00B8A0", "#8A958E", "#F1EDE4", "#F7F4EE", "#FFFFFF",
  "#F4F6F8", "#DDE3E9", "#2456E6", "#0C111B", "#141B29", "#28334A",
  "#5EEAD4", "#E4DED1", "#F3EEE3", "#FBF8F0", "#DCD2BC", "#A85B1E",
  "#100D08", "#1A1510", "#3A2F1E", "#FFB224", "#0B1220", "#111A2E",
  "#263659", "#4F8DFD", "#1E2A26",
]);

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameMembers(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    new Set(actual).size === actual.length && expected.every((value) => actual.includes(value));
}

function parseAttributes(rawTag, element, allowSourceText) {
  const body = rawTag
    .replace(/^<\/?\s*[A-Za-z][\w:-]*/, "")
    .replace(/\/?>$/, "")
    .trim();
  const found = new Map();
  let consumed = "";
  const matcher = /([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g;
  for (const match of body.matchAll(matcher)) {
    consumed += match[0];
    const name = match[1];
    const value = match[2].slice(1, -1);
    if ((!allowedAttributes.has(name) && !(allowSourceText && element === "text" && sourceTextAttributes.has(name))) ||
        /^on/i.test(name) || found.has(name)) {
      throw new Error(`Unsupported or duplicate SVG attribute ${name} on <${element}>.`);
    }
    found.set(name, value);
  }
  const normalizedBody = body.replace(matcher, "").replace(/\s/g, "");
  if (normalizedBody || (body && !consumed)) {
    throw new Error(`Malformed SVG attributes on <${element}>.`);
  }
  return found;
}

function validatePathData(pathData) {
  if (/[^MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]/.test(pathData) || /(?:NaN|Infinity)/i.test(pathData)) return false;
  const tokens = pathData.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const compact = pathData.replace(/[\s,]/g, "");
  if (tokens.join("") !== compact) return false;
  const arity = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  let index = 0;
  let sawMove = false;
  while (index < tokens.length) {
    const command = tokens[index];
    if (!/^[A-Za-z]$/.test(command) || !(command.toLowerCase() in arity)) return false;
    if (command.toLowerCase() === "m") sawMove = true;
    const expected = arity[command.toLowerCase()];
    index += 1;
    let values = 0;
    while (index < tokens.length && !/^[A-Za-z]$/.test(tokens[index])) {
      if (!Number.isFinite(Number(tokens[index]))) return false;
      values += 1;
      index += 1;
    }
    if ((expected === 0 && values !== 0) || (expected > 0 && (values === 0 || values % expected !== 0))) return false;
  }
  return sawMove;
}

/**
 * @param {string} source
 * @param {{expectedViewBox?: string, generated?: boolean, allowSourceText?: boolean}} [options]
 */
export function validateSafeSvg(source, options = {}) {
  const { expectedViewBox, generated = false, allowSourceText = false } = options;
  if (typeof source !== "string" || !source.trimEnd().endsWith("</svg>")) {
    throw new Error("Malformed SVG document.");
  }
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|<!--(?! generated by pnpm brand:generate; do not edit -->)/i.test(source)) {
    throw new Error("SVG contains unsupported declarations or comments.");
  }
  const activeElementPattern = allowSourceText
    ? /<(?:script|image|foreignObject|style|a)\b/i
    : /<(?:script|image|foreignObject|style|text|a)\b/i;
  if (activeElementPattern.test(source) || /\bon\w+\s*=|\b(?:url|data|javascript)\s*[:(]/i.test(source)) {
    throw new Error("SVG contains active content, live text, or an external/data reference.");
  }
  if (generated && !source.startsWith("<!-- generated by pnpm brand:generate; do not edit -->\n")) {
    throw new Error("Generated SVG marker is missing.");
  }

  const stack = [];
  let rootAttributes;
  let rootClosed = false;
  const ids = new Set();
  const references = [];
  const tags = [...source.matchAll(/<\/?[A-Za-z][^>]*>/g)];
  const contentForTextCheck = allowSourceText ? source.replace(/<text\b[^>]*>[\s\S]*?<\/text>/gi, "") : source;
  const nonTagContent = contentForTextCheck
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<\?xml[^?]*\?>/g, "")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .trim();
  if (nonTagContent) throw new Error("SVG contains text content.");
  for (const match of tags) {
    const raw = match[0];
    const closing = raw.startsWith("</");
    const selfClosing = /\/\s*>$/.test(raw);
    const name = raw.match(/^<\/?\s*([A-Za-z][\w:-]*)/)?.[1];
    if (!name || (!allowedElements.has(name) && !(allowSourceText && name === "text"))) {
      throw new Error(`Unsupported SVG element <${name ?? "?"}>.`);
    }
    if (closing) {
      if (stack.pop() !== name) throw new Error("Malformed SVG element nesting.");
      if (name === "svg") rootClosed = true;
      continue;
    }
    if (rootClosed || (rootAttributes && stack.length === 0)) throw new Error("SVG contains content outside its root element.");
    const attributes = parseAttributes(raw, name, allowSourceText);
    if (name === "svg") {
      if (rootAttributes) throw new Error("SVG must contain exactly one root element.");
      rootAttributes = attributes;
      if (attributes.get("xmlns") !== "http://www.w3.org/2000/svg") throw new Error("SVG namespace is invalid.");
    }
    const id = attributes.get("id");
    if (id && (ids.has(id) || !/^[A-Za-z][\w.-]*$/.test(id))) throw new Error(`Invalid or duplicate SVG ID: ${id}.`);
    if (id) ids.add(id);
    for (const colorAttribute of ["fill", "stroke"]) {
      const color = attributes.get(colorAttribute);
      if (color && !allowedColors.has(color)) throw new Error(`Unsupported SVG color semantic: ${color}.`);
    }
    for (const referenceAttribute of ["href", "xlink:href"]) {
      const reference = attributes.get(referenceAttribute);
      if (reference && !/^#glyph-0-\d+$/.test(reference)) throw new Error(`Non-local SVG reference: ${reference}.`);
      if (reference) references.push(reference.slice(1));
    }
    for (const numericAttribute of ["width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "stroke-width", "opacity", "fill-opacity"]) {
      const value = attributes.get(numericAttribute);
      if (value !== undefined && (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value) || !Number.isFinite(Number(value)))) {
        throw new Error(`Malformed SVG numeric geometry: ${numericAttribute}=${value}.`);
      }
    }
    for (const opacityAttribute of ["opacity", "fill-opacity"]) {
      const value = attributes.get(opacityAttribute);
      if (value !== undefined && (Number(value) < 0 || Number(value) > 1)) throw new Error(`SVG ${opacityAttribute} is outside 0..1.`);
    }
    const d = attributes.get("d");
    if ((name === "path" && !d) || (d && !validatePathData(d))) {
      throw new Error("Malformed SVG path geometry.");
    }
    const transform = attributes.get("transform");
    if (transform && !/^(?:(?:translate|scale|rotate|matrix)\(\s*-?(?:\d+\.?\d*|\.\d+)(?:[ ,]+-?(?:\d+\.?\d*|\.\d+)){0,5}\s*\)\s*)+$/.test(transform)) {
      throw new Error("Malformed or unsupported SVG transform.");
    }
    if (!selfClosing) stack.push(name);
  }
  if (stack.length || !rootAttributes || !rootClosed) throw new Error("Malformed SVG document structure.");
  if (references.some((reference) => !ids.has(reference))) throw new Error("SVG contains an unresolved local reference.");
  if (expectedViewBox && rootAttributes.get("viewBox") !== expectedViewBox) {
    throw new Error(`SVG viewBox drift: expected ${expectedViewBox}.`);
  }
  const viewBoxMembers = rootAttributes.get("viewBox")?.trim().split(/[ ,]+/).map(Number);
  if (!viewBoxMembers || viewBoxMembers.length !== 4 || viewBoxMembers.some((value) => !Number.isFinite(value)) ||
      viewBoxMembers[2] <= 0 || viewBoxMembers[3] <= 0) throw new Error("SVG viewBox geometry is malformed.");
  const width = Number(rootAttributes.get("width"));
  const height = Number(rootAttributes.get("height"));
  if ((rootAttributes.has("width") && (!Number.isFinite(width) || width <= 0)) ||
      (rootAttributes.has("height") && (!Number.isFinite(height) || height <= 0))) {
    throw new Error("SVG intrinsic dimensions must be positive finite numbers.");
  }
  return { viewBox: rootAttributes.get("viewBox"), width, height };
}

export function parseIcoFrames(icon) {
  if (!Buffer.isBuffer(icon) || icon.length < 6 || icon.readUInt16LE(0) !== 0 ||
      icon.readUInt16LE(2) !== 1) throw new Error("Invalid ICO header.");
  const count = icon.readUInt16LE(4);
  if (count !== 3 || icon.length < 6 + count * 16) throw new Error("ICO must contain exactly three frames.");
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = icon[entry] || 256;
    const height = icon[entry + 1] || 256;
    const bytes = icon.readUInt32LE(entry + 8);
    const offset = icon.readUInt32LE(entry + 12);
    if (width !== height || bytes < 24 || offset < 6 + count * 16 || offset + bytes > icon.length) {
      throw new Error("ICO directory entry is incoherent.");
    }
    const frame = icon.subarray(offset, offset + bytes);
    if (!frame.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        frame.readUInt32BE(16) !== width || frame.readUInt32BE(20) !== height) {
      throw new Error("ICO frame bytes do not match their directory entry.");
    }
    frames.push({ width, height, bytes, offset, sha256: sha256(frame) });
  }
  if (!sameMembers(frames.map(({ width }) => width), [16, 32, 48])) {
    throw new Error("ICO frames must be exactly 16, 32, and 48 pixels.");
  }
  const ranges = frames.map(({ offset, bytes }) => [offset, offset + bytes]).sort((a, b) => a[0] - b[0]);
  if (ranges.some((range, index) => index > 0 && range[0] < ranges[index - 1][1])) {
    throw new Error("ICO frames overlap.");
  }
  return frames;
}

export function validateIdentityContract({ sourceIdentityIds, manifest }) {
  if (!sameMembers(sourceIdentityIds, requiredIdentityIds) || !sameMembers(manifest.identities, requiredIdentityIds)) {
    throw new Error("Identity inventory is not the closed four-ID contract.");
  }
  const identityAssets = manifest.derivatives.filter(({ identityId }) => identityId);
  for (const [identityId, outputIds] of Object.entries(requiredIdentityContract)) {
    for (const id of outputIds) {
      const matches = identityAssets.filter((asset) => asset.id === id);
      const expectedVariant = id.endsWith("-reversed") ? "reversed" : "positive";
      if (matches.length !== 1 || matches[0].identityId !== identityId || matches[0].staticVariant !== expectedVariant) {
        throw new Error(`Static identity composition mapping is invalid: ${id}`);
      }
    }
  }
  if (identityAssets.length !== 8) throw new Error("Static identity export count does not match the closed contract.");
}

export function validateManifestContract(manifest) {
  if (manifest.version !== 2 || manifest.family !== "QR Pagamentos template identity") {
    throw new Error("Brand manifest version or family is invalid.");
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length !== 14 ||
      new Set(manifest.sources.map(({ parityId }) => parityId)).size !== 14 ||
      new Set(manifest.sources.map(({ sha256: hash }) => hash)).size !== 14) {
    throw new Error("Source inventory must contain 14 unique parity and byte identities.");
  }
  if (!sameMembers(manifest.sources.map(({ sourcePath }) => sourcePath),
    requiredSourceFiles.map((file) => `docs/template/app/public/${file}`))) {
    throw new Error("Source path inventory differs from the closed 17-file contract.");
  }
  if (manifest.provenance?.sourceCommit !== "813f0cd7" ||
      manifest.provenance?.projectOrigin !== "Os assets foram todos construídos para nosso projeto" ||
      manifest.provenance?.wordmark?.family !== "Sora" || manifest.provenance?.wordmark?.weight !== 700) {
    throw new Error("Top-level source or Sora provenance is incomplete.");
  }
  for (const source of manifest.sources) {
    if (!/^asset:[0-9a-f]{16}$/.test(source.parityId) || !/^docs\/template\/app\/public\/.+\.svg$/.test(source.sourcePath) ||
        !Number.isInteger(source.bytes) || source.bytes <= 0 || !/^[0-9a-f]{64}$/.test(source.sha256) ||
      !source.intrinsic || source.intrinsic.width <= 0 || source.intrinsic.height <= 0 ||
        source.viewBox !== `0 0 ${source.intrinsic.width} ${source.intrinsic.height}` ||
        source.mime !== "image/svg+xml" || !source.role || source.sourceCommit !== "813f0cd7" ||
        source.projectOrigin !== "Os assets foram todos construídos para nosso projeto" ||
        source.projectUseAuthorized !== true || !source.provenanceReference) {
      throw new Error(`Incomplete source provenance: ${source.sourcePath ?? "unknown"}.`);
    }
  }
  if (!Array.isArray(manifest.derivatives) || manifest.derivatives.length !== 25 ||
      new Set(manifest.derivatives.map(({ outputPath }) => outputPath)).size !== manifest.derivatives.length ||
      new Set(manifest.derivatives.map(({ sha256: hash }) => hash)).size !== manifest.derivatives.length) {
    throw new Error("Derivative inventory must be closed, path-unique, and byte-unique.");
  }
  if (!sameMembers(manifest.derivatives.map(({ outputPath }) => outputPath), requiredDerivativePaths)) {
    throw new Error("Derivative paths differ from the closed generated inventory.");
  }
  const sourceParityIds = new Set(manifest.sources.map(({ parityId }) => parityId));
  for (const asset of manifest.derivatives) {
    if (!asset.id || !asset.role || !asset.derivation || !asset.outputPath || !asset.mime ||
        !asset.intrinsic || !asset.colorMode || !asset.accessibilityMode || asset.generated !== true ||
        !Number.isInteger(asset.bytes) || asset.bytes <= 0 ||
        !/^[0-9a-f]{64}$/.test(asset.sha256) || !Array.isArray(asset.sourceParityIds) ||
        asset.sourceParityIds.length === 0 || !asset.provenanceReference) {
      throw new Error(`Incomplete derivative contract: ${asset.outputPath ?? "unknown"}.`);
    }
    if (new Set(asset.sourceParityIds).size !== asset.sourceParityIds.length ||
        asset.sourceParityIds.some((parityId) => !sourceParityIds.has(parityId))) {
      throw new Error(`Derivative references an unknown or duplicate source: ${asset.outputPath}.`);
    }
    const expectedMime = asset.outputPath.endsWith(".svg") ? "image/svg+xml" :
      asset.outputPath.endsWith(".png") ? "image/png" : "image/x-icon";
    if (asset.mime !== expectedMime) throw new Error(`Derivative MIME does not match its path: ${asset.outputPath}.`);
  }
  const swatches = manifest.derivatives.filter(({ role }) => role === "theme-swatch");
  if (!sameMembers(swatches.map(({ themeId }) => themeId), requiredThemeIds)) {
    throw new Error("Theme swatches must use the exact six stored IDs.");
  }
  const favicon = manifest.derivatives.find(({ outputPath }) => outputPath === "src/app/favicon.ico");
  if (!favicon || !sameMembers(favicon.intrinsic.frames, [16, 32, 48]) ||
      !sameMembers(Object.keys(favicon.frameSha256).map(Number), [16, 32, 48]) ||
      Object.values(favicon.frameSha256).some((hash) => !/^[0-9a-f]{64}$/.test(hash))) {
    throw new Error("Favicon manifest must bind exact 16/32/48 frame hashes.");
  }
  validateIdentityContract({ sourceIdentityIds: manifest.identities, manifest });
}
