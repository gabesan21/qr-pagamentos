import { describe, expect, it } from "vitest";

import {
  requiredIdentityIds,
  validateIdentityContract,
} from "./brand-contract.mjs";

function generatedManifest() {
  const assets = [
    ["mark-only", "mark"],
    ["product-lockup", "product-lockup"],
    ["compact-role-lockup", "compact-role-lockup"],
    ["merchant-fallback", "merchant-fallback"],
  ].flatMap(([identityId, file]) =>
    ["positive", "reversed"].map((staticVariant) => ({
      identityId,
      role: identityId,
      staticVariant,
      outputPath: `public/brand/${file}-${staticVariant}.svg`,
      mime: "image/svg+xml",
    })),
  );
  return { identities: [...requiredIdentityIds], assets };
}

describe("independent brand identity contract", () => {
  it("accepts the exact four generated identity mappings", () => {
    expect(() =>
      validateIdentityContract({
        sourceIdentityIds: [...requiredIdentityIds],
        manifest: generatedManifest(),
      }),
    ).not.toThrow();
  });

  it("rejects an unknown ID even when source inventory and regenerated manifest agree", () => {
    const manifest = generatedManifest();
    manifest.identities.push("unknown-lockup");

    expect(() =>
      validateIdentityContract({
        sourceIdentityIds: [...requiredIdentityIds, "unknown-lockup"],
        manifest,
      }),
    ).toThrow(/closed four-ID/);
  });

  it("rejects a missing ID even when source inventory and regenerated manifest agree", () => {
    const manifest = generatedManifest();
    manifest.identities = manifest.identities.filter((id) => id !== "merchant-fallback");
    manifest.assets = manifest.assets.filter(
      ({ identityId }) => identityId !== "merchant-fallback",
    );

    expect(() =>
      validateIdentityContract({
        sourceIdentityIds: requiredIdentityIds.filter((id) => id !== "merchant-fallback"),
        manifest,
      }),
    ).toThrow(/closed four-ID/);
  });

  it("rejects duplicate IDs and remapped compositions", () => {
    const duplicate = generatedManifest();
    duplicate.identities.push("mark-only");
    expect(() =>
      validateIdentityContract({
        sourceIdentityIds: [...requiredIdentityIds],
        manifest: duplicate,
      }),
    ).toThrow(/closed four-ID/);

    const remapped = generatedManifest();
    const product = remapped.assets.find(
      ({ outputPath }) => outputPath === "public/brand/product-lockup-positive.svg",
    );
    if (!product) throw new Error("Test fixture is missing the product lockup.");
    product.identityId = "merchant-fallback";
    product.role = "merchant-fallback";

    expect(() =>
      validateIdentityContract({
        sourceIdentityIds: [...requiredIdentityIds],
        manifest: remapped,
      }),
    ).toThrow(/composition mapping/);
  });
});
