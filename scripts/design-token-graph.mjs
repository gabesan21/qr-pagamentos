export function hexToOklch(hex) {
  const rgb = hex.slice(1).match(/.{2}/g).map((value) => Number.parseInt(value, 16) / 255);
  const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const l = 0.4122214708 * linear[0] + 0.5363325363 * linear[1] + 0.0514459929 * linear[2];
  const m = 0.2119034982 * linear[0] + 0.6806995451 * linear[1] + 0.1073969566 * linear[2];
  const s = 0.0883024619 * linear[0] + 0.2817188376 * linear[1] + 0.6299787005 * linear[2];
  const l3 = Math.cbrt(l), m3 = Math.cbrt(m), s3 = Math.cbrt(s);
  const L = 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3;
  const a = 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3;
  const b = 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3;
  const hue = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
  return [Number(L.toFixed(6)), Number(Math.hypot(a, b).toFixed(6)), Number(hue.toFixed(4))];
}

export function oklchToSrgb([L, C, hue]) {
  const radians = hue * Math.PI / 180;
  const a = C * Math.cos(radians), b = C * Math.sin(radians);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((value) => value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);
}

export function hexFromOklch(components) {
  const rgb = oklchToSrgb(components);
  if (rgb.some((value) => value < -0.00001 || value > 1.00001)) throw new Error(`Out-of-sRGB OKLCH: ${components.join(" ")}`);
  return `#${rgb.map((value) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function resolveToken(root, path, stack = []) {
  if (stack.includes(path)) throw new Error(`Token reference cycle: ${[...stack, path].join(" -> ")}`);
  const node = path.split(".").reduce((value, segment) => value?.[segment], root);
  if (!node || !("$value" in node)) throw new Error(`Unresolved token reference: ${path}`);
  const value = node.$value;
  const match = typeof value === "string" ? value.match(/^\{([^}]+)\}$/) : null;
  return match ? resolveToken(root, match[1], [...stack, path]) : value;
}

export function resolveExternalRef(root, reference) {
  const [, pointer = ""] = reference.split("#");
  const path = pointer.replace(/^\//, "").split("/").filter(Boolean);
  const value = path.reduce((node, segment) => node?.[segment], root);
  if (!value) throw new Error(`Unresolved resolver reference: ${reference}`);
  return value;
}
