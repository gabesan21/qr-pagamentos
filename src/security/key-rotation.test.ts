import { describe, expect, it } from "vitest";

import {
  assertNoUnreadableRows,
  rewrapColumn,
  runRewrap,
  type RewrapCrypto,
  type RewrapRow,
  type RewrapStore,
} from "./key-rotation";

// A tiny deterministic stand-in for AES-256-GCM: "key-name:plaintext" as
// ciphertext. Distinct from the real crypto modules on purpose — the core
// under test only depends on the RewrapCrypto contract (encrypt/decrypt
// throwing on the wrong key), never on a specific algorithm.
function fakeCrypto(): RewrapCrypto {
  return {
    encrypt(plaintext: string, key: Buffer): string {
      return `${key.toString("hex")}:${plaintext}`;
    },
    decrypt(ciphertext: string, key: Buffer): string {
      const prefix = `${key.toString("hex")}:`;
      if (!ciphertext.startsWith(prefix)) throw new Error("decryption failed");
      return ciphertext.slice(prefix.length);
    },
  };
}

class FakeStore implements RewrapStore {
  rows = new Map<string, Map<string, string>>();
  updateCalls: Array<{ target: string; id: string }> = [];

  constructor(target: string, seed: Record<string, string>) {
    this.rows.set(target, new Map(Object.entries(seed)));
  }

  async *scan(target: string): AsyncIterable<RewrapRow> {
    const table = this.rows.get(target) ?? new Map();
    for (const [id, ciphertext] of table) {
      yield { id, ciphertext };
    }
  }

  async updateConditional(target: string, id: string, expected: string, next: string): Promise<boolean> {
    this.updateCalls.push({ target, id });
    const table = this.rows.get(target);
    const current = table?.get(id);
    if (current !== expected) return false;
    table!.set(id, next);
    return true;
  }
}

const currentKey = Buffer.alloc(32, 0x01);
const previousKey = Buffer.alloc(32, 0x02);
const strangerKey = Buffer.alloc(32, 0x03);

describe("rewrapColumn", () => {
  it("rewraps a row readable only under the previous key and writes conditionally on the observed ciphertext", async () => {
    const crypto = fakeCrypto();
    const store = new FakeStore("nautt_api_key", {
      "user-1": crypto.encrypt("secret-api-key", previousKey),
    });

    const counts = await rewrapColumn(store, { target: "nautt_api_key", crypto, key: currentKey, previousKey });

    expect(counts).toEqual({ scanned: 1, rewrapped: 1, skipped: 0, unreadable: 0 });
    expect(store.rows.get("nautt_api_key")!.get("user-1")).toBe(crypto.encrypt("secret-api-key", currentKey));
    expect(store.updateCalls).toEqual([{ target: "nautt_api_key", id: "user-1" }]);
  });

  it("is idempotent: a row already readable under the current key is left alone and a re-run rewraps zero rows", async () => {
    const crypto = fakeCrypto();
    const store = new FakeStore("nautt_api_key", {
      "user-1": crypto.encrypt("already-current", currentKey),
    });

    const first = await rewrapColumn(store, { target: "nautt_api_key", crypto, key: currentKey, previousKey });
    expect(first).toEqual({ scanned: 1, rewrapped: 0, skipped: 1, unreadable: 0 });
    expect(store.updateCalls).toEqual([]);

    const second = await rewrapColumn(store, { target: "nautt_api_key", crypto, key: currentKey, previousKey });
    expect(second).toEqual({ scanned: 1, rewrapped: 0, skipped: 1, unreadable: 0 });
  });

  it("resumability: a re-run after a partial rotation rewraps only the still-previous rows and leaves the rest at zero", async () => {
    const crypto = fakeCrypto();
    const store = new FakeStore("nautt_api_key", {
      "user-1": crypto.encrypt("already-rotated", currentKey),
      "user-2": crypto.encrypt("still-previous", previousKey),
    });

    const counts = await rewrapColumn(store, { target: "nautt_api_key", crypto, key: currentKey, previousKey });
    expect(counts).toEqual({ scanned: 2, rewrapped: 1, skipped: 1, unreadable: 0 });

    const rerun = await rewrapColumn(store, { target: "nautt_api_key", crypto, key: currentKey, previousKey });
    expect(rerun).toEqual({ scanned: 2, rewrapped: 0, skipped: 2, unreadable: 0 });
  });

  it("marks a row unreadable under both keys as a failure, never a silent skip, and never calls update", async () => {
    const crypto = fakeCrypto();
    const store = new FakeStore("nautt_api_key", {
      "user-1": crypto.encrypt("stranger-owned", strangerKey),
    });

    const counts = await rewrapColumn(store, { target: "nautt_api_key", crypto, key: currentKey, previousKey });

    expect(counts).toEqual({ scanned: 1, rewrapped: 0, skipped: 0, unreadable: 1 });
    expect(store.updateCalls).toEqual([]);
  });

  it("reports unreadable, not a false success, when no previous key is configured and the row is not current", async () => {
    const crypto = fakeCrypto();
    const store = new FakeStore("nautt_api_key", {
      "user-1": crypto.encrypt("only-under-previous", previousKey),
    });

    const counts = await rewrapColumn(store, { target: "nautt_api_key", crypto, key: currentKey, previousKey: undefined });

    expect(counts).toEqual({ scanned: 1, rewrapped: 0, skipped: 0, unreadable: 1 });
  });

  it("treats a conditional-update race (ciphertext changed since read) as a safe no-op, not an error", async () => {
    const crypto = fakeCrypto();
    const store = new FakeStore("nautt_api_key", {
      "user-1": crypto.encrypt("racing-row", previousKey),
    });
    const originalUpdate = store.updateConditional.bind(store);
    store.updateConditional = async (target, id, expected, next) => {
      // Simulate the row moving between the read and the conditional write.
      store.rows.get(target)!.set(id, crypto.encrypt("racing-row", currentKey));
      return originalUpdate(target, id, expected, next);
    };

    const counts = await rewrapColumn(store, { target: "nautt_api_key", crypto, key: currentKey, previousKey });

    expect(counts).toEqual({ scanned: 1, rewrapped: 0, skipped: 1, unreadable: 0 });
  });
});

describe("runRewrap", () => {
  it("covers exactly the three ciphertext columns and reports counts grouped per table, ignoring null webhook secrets", async () => {
    const nautt = fakeCrypto();
    const totp = fakeCrypto();
    const store: RewrapStore = {
      async *scan(target) {
        if (target === "nautt_api_key") {
          yield { id: "user-1", ciphertext: nautt.encrypt("api-key-1", previousKey) };
          yield { id: "user-2", ciphertext: nautt.encrypt("api-key-2", currentKey) };
        } else if (target === "nautt_webhook_secret") {
          // user-2 has no webhook secret configured (nullable column): the
          // store yields nothing for it, never a synthetic row.
          yield { id: "user-1", ciphertext: nautt.encrypt("webhook-secret-1", previousKey) };
        } else if (target === "totp_secret") {
          yield { id: "user-1", ciphertext: totp.encrypt("totp-secret-1", previousKey) };
        }
      },
      async updateConditional() {
        return true;
      },
    };

    const reports = await runRewrap(
      store,
      { nauttKey: currentKey, nauttPreviousKey: previousKey, totpKey: currentKey, totpPreviousKey: previousKey },
      { nautt, totp },
    );

    expect(reports).toEqual([
      { table: "nautt_credential", scanned: 3, rewrapped: 2, skipped: 1, unreadable: 0 },
      { table: "totp_credential", scanned: 1, rewrapped: 1, skipped: 0, unreadable: 0 },
    ]);
    // The report is counts and a fixed table label only — never a value from the rows.
    for (const report of reports) {
      expect(Object.keys(report).sort()).toEqual(["rewrapped", "scanned", "skipped", "table", "unreadable"]);
    }
  });

  it("assertNoUnreadableRows throws when any table has an unreadable row, and stays silent otherwise", () => {
    expect(() =>
      assertNoUnreadableRows([
        { table: "nautt_credential", scanned: 1, rewrapped: 0, skipped: 0, unreadable: 1 },
        { table: "totp_credential", scanned: 1, rewrapped: 1, skipped: 0, unreadable: 0 },
      ]),
    ).toThrow(/nautt_credential/);

    expect(() =>
      assertNoUnreadableRows([
        { table: "nautt_credential", scanned: 1, rewrapped: 1, skipped: 0, unreadable: 0 },
        { table: "totp_credential", scanned: 1, rewrapped: 0, skipped: 1, unreadable: 0 },
      ]),
    ).not.toThrow();
  });
});
