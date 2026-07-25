import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// BETA(M-5.1) mechanical guard: pins the loud bypass marker and the absence of HMAC owner verification in the
// intake module, so the beta seam can neither lose its marker nor silently regain verification. Delete this
// file when the M-5.1 reversal restores the signature gate.
const intakeSource = readFileSync(join(process.cwd(), "src/integrations/nautt/webhook-intake.ts"), "utf8");

describe("BETA(M-5.1) unverified webhook intake guard", () => {
  it("keeps the loud beta marker on the bypass seam", () => {
    expect(intakeSource).toContain("BETA(M-5.1)");
  });

  it("never regains HMAC owner verification inside the intake module", () => {
    expect(intakeSource).not.toContain("verifyWebhookOwner(");
  });
});
