const requiredIdentityContract = Object.freeze({
  "mark-only": Object.freeze({
    outputs: Object.freeze([
      "public/brand/mark-positive.svg",
      "public/brand/mark-reversed.svg",
    ]),
  }),
  "product-lockup": Object.freeze({
    outputs: Object.freeze([
      "public/brand/product-lockup-positive.svg",
      "public/brand/product-lockup-reversed.svg",
    ]),
  }),
  "compact-role-lockup": Object.freeze({
    outputs: Object.freeze([
      "public/brand/compact-role-lockup-positive.svg",
      "public/brand/compact-role-lockup-reversed.svg",
    ]),
  }),
  "merchant-fallback": Object.freeze({
    outputs: Object.freeze([
      "public/brand/merchant-fallback-positive.svg",
      "public/brand/merchant-fallback-reversed.svg",
    ]),
  }),
});

export const requiredIdentityIds = Object.freeze(Object.keys(requiredIdentityContract));

function sameMembers(actual, expected) {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((value) => actual.includes(value))
  );
}

export function validateIdentityContract({ sourceIdentityIds, manifest }) {
  if (!sameMembers(sourceIdentityIds, requiredIdentityIds)) {
    throw new Error("Canonical source identity inventory is not the closed four-ID contract.");
  }
  if (!sameMembers(manifest.identities, requiredIdentityIds)) {
    throw new Error("Manifest identity inventory is not the closed four-ID contract.");
  }

  const staticAssets = manifest.assets.filter(({ mime }) => mime === "image/svg+xml");
  const expectedOutputCount = Object.values(requiredIdentityContract).reduce(
    (count, { outputs }) => count + outputs.length,
    0,
  );
  if (staticAssets.length !== expectedOutputCount) {
    throw new Error("Static identity export count does not match the closed contract.");
  }

  for (const [identityId, { outputs }] of Object.entries(requiredIdentityContract)) {
    for (const outputPath of outputs) {
      const matches = staticAssets.filter((asset) => asset.outputPath === outputPath);
      if (
        matches.length !== 1 ||
        matches[0].identityId !== identityId ||
        matches[0].role !== identityId ||
        matches[0].staticVariant !== (outputPath.includes("-reversed.") ? "reversed" : "positive")
      ) {
        throw new Error(`Static identity composition mapping is invalid: ${outputPath}`);
      }
    }
  }

  for (const asset of staticAssets) {
    const expected = requiredIdentityContract[asset.identityId];
    if (!expected || !expected.outputs.includes(asset.outputPath)) {
      throw new Error(`Unknown or remapped static identity output: ${asset.outputPath}`);
    }
  }
}
