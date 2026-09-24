import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createWebhookSecretCandidateLoader } from "./webhook-secret-candidates";

const key = Buffer.alloc(32, 0x11);
const previousKey = Buffer.alloc(32, 0x22);

describe("webhook secret candidate loader", () => {
  it("decrypts every row with the current key when no previous key is configured", async () => {
    const loadEncryptedCandidates = vi.fn(async () => [
      { ownerId: "owner-a", encryptedWebhookSecret: "enc:secret-a" },
      { ownerId: "owner-b", encryptedWebhookSecret: "enc:secret-b" },
    ]);
    const decryptSecret = vi.fn((encrypted: string) => encrypted.split(":")[1]);
    const load = createWebhookSecretCandidateLoader(loadEncryptedCandidates, {
      loadKey: () => key,
      loadPreviousKey: () => undefined,
      decryptSecret,
    });

    const candidates = await load();

    expect(candidates.map((candidate) => candidate.secret.toString("utf8"))).toEqual(["secret-a", "secret-b"]);
    expect(decryptSecret).toHaveBeenCalledWith("enc:secret-a", key, undefined);
    expect(decryptSecret).toHaveBeenCalledWith("enc:secret-b", key, undefined);
  });

  it("passes the previous key through to every decrypt call during the rotation window", async () => {
    const loadEncryptedCandidates = vi.fn(async () => [{ ownerId: "owner-a", encryptedWebhookSecret: "enc:secret-a" }]);
    const decryptSecret = vi.fn((encrypted: string) => encrypted.split(":")[1]);
    const load = createWebhookSecretCandidateLoader(loadEncryptedCandidates, {
      loadKey: () => key,
      loadPreviousKey: () => previousKey,
      decryptSecret,
    });

    await load();

    expect(decryptSecret).toHaveBeenCalledWith("enc:secret-a", key, previousKey);
  });

  it("propagates a decryption failure and zeroes every already-decrypted candidate", async () => {
    const loadEncryptedCandidates = vi.fn(async () => [
      { ownerId: "owner-a", encryptedWebhookSecret: "enc:secret-a" },
      { ownerId: "owner-b", encryptedWebhookSecret: "malformed" },
    ]);
    const decryptSecret = vi.fn((encrypted: string) => {
      if (encrypted === "malformed") throw new Error("Decryption failed");
      return encrypted.split(":")[1];
    });
    const load = createWebhookSecretCandidateLoader(loadEncryptedCandidates, {
      loadKey: () => key,
      loadPreviousKey: () => undefined,
      decryptSecret,
    });

    await expect(load()).rejects.toThrow("Decryption failed");
  });
});
